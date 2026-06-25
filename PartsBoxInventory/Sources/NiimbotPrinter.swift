import Combine
import CoreBluetooth
import CoreGraphics
import Foundation
import ImageIO
import os

/// Logger for the printer/BLE subsystem. View in Xcode's console or Console.app by filtering
/// subsystem `com.partsbox.inventory`, category `printer`.
private let printerLog = Logger(subsystem: "com.partsbox.inventory", category: "printer")

private func hexString(_ bytes: [UInt8]) -> String {
    bytes.map { String(format: "%02x", $0) }.joined(separator: " ")
}

/// Drives a NIIMBOT label printer over Bluetooth LE. Connect-per-job: each `print`
/// connects, runs the B1 sequence, then disconnects. Jobs are serialized by the caller
/// awaiting `print(pngData:)`.
@MainActor
final class NiimbotPrinter: NSObject, ObservableObject {
    static let serviceUUID = CBUUID(string: "e7810a71-73ae-499d-8c15-faa9aef0c3f2")

    enum Status: Equatable {
        case unknown, poweredOff, unauthorized, idle, scanning
        case findingPrinter, printerFound, initializing, printing, done
        case failed(String)

        /// Human-readable text for the print status popup.
        var displayText: String {
            switch self {
            case .unknown: return "Starting Bluetooth…"
            case .poweredOff: return "Bluetooth is off"
            case .unauthorized: return "Bluetooth permission needed"
            case .idle: return "Ready"
            case .scanning: return "Searching for printers…"
            case .findingPrinter: return "Finding printer…"
            case .printerFound: return "Printer found"
            case .initializing: return "Initializing…"
            case .printing: return "Printing…"
            case .done: return "Done"
            case .failed(let message): return message
            }
        }

        var isActive: Bool {
            switch self {
            case .findingPrinter, .printerFound, .initializing, .printing: return true
            default: return false
            }
        }
    }

    struct Found: Identifiable, Equatable {
        let id: UUID
        let name: String
    }

    @Published private(set) var status: Status = .unknown
    @Published private(set) var discovered: [Found] = []
    /// The peripheral identifier to reconnect to, persisted across launches.
    @Published var savedPrinterID: UUID? {
        didSet { persistSavedPrinter() }
    }
    @Published var savedPrinterName: String?
    @Published var rotate180: Bool {
        didSet { persistPrintAdjustments() }
    }
    @Published var mirrorHorizontally: Bool {
        didSet { persistPrintAdjustments() }
    }
    @Published var verticalOffsetRows: Int {
        didSet { persistPrintAdjustments() }
    }
    @Published var labelPaperSize: LabelPaperSize {
        didSet { persistPrintAdjustments() }
    }
    @Published private(set) var jobProgress: Double?
    @Published private(set) var jobProgressMessage: String?

    private static let savedIDKey = "niimbot.savedPrinterID"
    private static let savedNameKey = "niimbot.savedPrinterName"
    private static let rotate180Key = "niimbot.rotate180"
    private static let mirrorKey = "niimbot.flipHorizontally"
    private static let legacyRotateKey = "niimbot.mirrorHorizontally"
    private static let verticalOffsetKey = "niimbot.verticalOffsetRows"
    private static let paperSizeKey = "niimbot.labelPaperSize"

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var channel: CBCharacteristic?
    private var rxBuffer: [UInt8] = []

    private var poweredOnWaiters: [CheckedContinuation<Void, Error>] = []
    private var connectCont: CheckedContinuation<Void, Error>?
    private var discoverCont: CheckedContinuation<Void, Error>?
    private var writeCont: CheckedContinuation<Void, Error>?
    private var responseWaiter: (id: UInt64, command: UInt8, cont: CheckedContinuation<NiimbotResponse, Error>)?
    private var responseWaiterSeq: UInt64 = 0

    enum PrinterError: LocalizedError {
        case bluetoothUnavailable, notSelected, notFound, channelNotFound, badImage, timeout(String)
        var errorDescription: String? {
            switch self {
            case .bluetoothUnavailable: return "Bluetooth is off or unavailable."
            case .notSelected: return "No printer selected. Pair one in Manage."
            case .notFound: return "Saved printer not found. Make sure it is on and nearby."
            case .channelNotFound: return "Printer is missing the expected Bluetooth characteristic."
            case .badImage: return "Could not decode the label image."
            case .timeout(let what): return "Timed out waiting for \(what)."
            }
        }
    }

    override init() {
        let defaults = UserDefaults.standard
        let storedName = defaults.string(forKey: Self.savedNameKey)
        let rotateDefault = storedName?.uppercased().contains("M2") ?? false
        let mirrorDefault = storedName?.uppercased().contains("M2") ?? false
        let rotateStored: Bool
        if defaults.object(forKey: Self.rotate180Key) != nil {
            rotateStored = defaults.bool(forKey: Self.rotate180Key)
        } else if defaults.object(forKey: Self.legacyRotateKey) != nil {
            rotateStored = defaults.bool(forKey: Self.legacyRotateKey)
        } else {
            rotateStored = rotateDefault
        }
        let mirrorStored: Bool
        if defaults.object(forKey: Self.mirrorKey) != nil {
            mirrorStored = defaults.bool(forKey: Self.mirrorKey)
        } else {
            mirrorStored = mirrorDefault
        }
        let offsetStored = defaults.object(forKey: Self.verticalOffsetKey) != nil ? defaults.integer(forKey: Self.verticalOffsetKey) : 0
        let paperSizeStored = defaults.string(forKey: Self.paperSizeKey).flatMap(LabelPaperSize.init(rawValue:)) ?? .mm30x15
        rotate180 = rotateStored
        mirrorHorizontally = mirrorStored
        verticalOffsetRows = offsetStored
        labelPaperSize = paperSizeStored
        jobProgress = nil
        jobProgressMessage = nil
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
        if let raw = UserDefaults.standard.string(forKey: Self.savedIDKey), let id = UUID(uuidString: raw) {
            savedPrinterID = id
            savedPrinterName = UserDefaults.standard.string(forKey: Self.savedNameKey)
        }
    }

    private func persistSavedPrinter() {
        let defaults = UserDefaults.standard
        if let id = savedPrinterID {
            defaults.set(id.uuidString, forKey: Self.savedIDKey)
            defaults.set(savedPrinterName, forKey: Self.savedNameKey)
        } else {
            defaults.removeObject(forKey: Self.savedIDKey)
            defaults.removeObject(forKey: Self.savedNameKey)
        }
    }

    private func persistPrintAdjustments() {
        let defaults = UserDefaults.standard
        defaults.set(rotate180, forKey: Self.rotate180Key)
        defaults.set(mirrorHorizontally, forKey: Self.mirrorKey)
        defaults.set(verticalOffsetRows, forKey: Self.verticalOffsetKey)
        defaults.set(labelPaperSize.rawValue, forKey: Self.paperSizeKey)
    }

    /// Saved-printer display name for UI, falling back to the most recent discovery.
    func displayName(for id: UUID) -> String {
        discovered.first(where: { $0.id == id })?.name ?? savedPrinterName ?? "Saved printer"
    }

    // MARK: - Discovery (pairing UI)

    func startScan() {
        discovered = []
        Task {
            do {
                try await waitPoweredOn()
                status = .scanning
                printerLog.info("scan started for NIIMBOT peripherals (service \(Self.serviceUUID, privacy: .public) will be used after connect)")
                central.scanForPeripherals(withServices: nil)
            } catch {
                printerLog.error("scan failed: \(error.localizedDescription, privacy: .public)")
                status = .failed((error as? LocalizedError)?.errorDescription ?? "\(error)")
            }
        }
    }

    func stopScan() {
        central.stopScan()
        if status == .scanning { status = .idle }
    }

    func select(_ id: UUID) {
        savedPrinterName = discovered.first(where: { $0.id == id })?.name
        savedPrinterID = id
        if UserDefaults.standard.object(forKey: Self.rotate180Key) == nil
            && UserDefaults.standard.object(forKey: Self.legacyRotateKey) == nil {
            rotate180 = savedPrinterName?.uppercased().contains("M2") ?? false
        }
        if UserDefaults.standard.object(forKey: Self.mirrorKey) == nil {
            mirrorHorizontally = savedPrinterName?.uppercased().contains("M2") ?? false
        }
        stopScan()
    }

    func forgetPrinter() {
        savedPrinterName = nil
        savedPrinterID = nil
    }

    /// Resets a terminal status back to idle (e.g. when reopening the print sheet).
    func resetStatus() {
        if case .failed = status { status = .idle }
        if status == .done { status = .idle }
        jobProgress = nil
        jobProgressMessage = nil
    }

    // MARK: - Printing

    /// Connects, prints the rendered label PNG, then disconnects.
    func print(pngData: Data) async throws {
        guard let id = savedPrinterID else { throw PrinterError.notSelected }
        guard let mono = Self.decodeMono(pngData: pngData) else { throw PrinterError.badImage }
        printerLog.info("print start: \(pngData.count) bytes PNG -> \(mono.width)x\(mono.height) mono, printer \(id.uuidString, privacy: .public)")
        jobProgress = 0
        jobProgressMessage = "Preparing print job…"

        status = .findingPrinter
        do {
            try await waitPoweredOn()
            let target = try resolvePeripheral(id: id)
            printerLog.info("connecting to \(target.identifier.uuidString, privacy: .public)")
            try await connectAndDiscover(target)
            guard let characteristic = channel else { throw PrinterError.channelNotFound }
            printerLog.info("connected; using characteristic \(characteristic.uuid, privacy: .public) props=\(characteristic.properties.rawValue)")
            status = .printerFound
            try await runPrintJob(mono: mono)
            disconnect()
            status = .done
            jobProgress = 1
            jobProgressMessage = "Done"
            printerLog.info("print finished OK")
        } catch {
            printerLog.error("print failed: \(error.localizedDescription, privacy: .public)")
            disconnect()
            status = .failed((error as? LocalizedError)?.errorDescription ?? "\(error)")
            throw error
        }
    }

    private func runPrintJob(mono: MonoImage) async throws {
        let image = LabelImageEncoder.encode(
            width: mono.width,
            height: mono.height,
            transform: .init(rotate180: rotate180, mirrorHorizontally: mirrorHorizontally, verticalOffsetRows: verticalOffsetRows),
            isBlack: mono.isBlack
        )
        let packets = LabelImageEncoder.imagePackets(image, printheadPixels: printheadPixels)

        status = .initializing
        jobProgress = 0
        jobProgressMessage = "Sending label data…"
        try await send(NiimbotCommands.setDensity(3), expect: 49)            // In_SetDensity
        try await send(NiimbotCommands.setLabelType(LabelType.withGaps.rawValue), expect: 51) // In_SetLabelType
        try await send(NiimbotCommands.printStart7b(totalPages: 1), expect: 2)               // In_PrintStart
        try await send(NiimbotCommands.pageStart(), expect: 4)               // In_PageStart
        try await send(NiimbotCommands.setPageSize6b(rows: mono.height, cols: mono.width, copies: 1), expect: 20) // In_SetPageSize

        status = .printing
        for (index, packet) in packets.enumerated() {
            try await rawWrite(packet.toBytes()) // bitmap rows are one-way
            let sendFraction = packets.isEmpty ? 1 : Double(index + 1) / Double(packets.count)
            jobProgress = 0.5 * sendFraction
            jobProgressMessage = "Sending label data…"
        }

        try await send(NiimbotCommands.pageEnd(), expect: 228)               // In_PageEnd
        printerLog.info("page sent (\(image.rowsData.count) row packets); waiting for finish")
        jobProgress = 0.5
        jobProgressMessage = "Printing label…"
        try await waitForFinished(totalPages: 1)
        try await rawWrite(NiimbotCommands.printEnd().toBytes())
    }

    private var printheadPixels: Int {
        if let name = savedPrinterName?.uppercased(), name.contains("M2") {
            return 567
        }
        return Self.defaultPrintheadPixels
    }

    private static let defaultPrintheadPixels = 384

    private func waitForFinished(totalPages: Int, overallTimeout: TimeInterval = 20) async throws {
        let deadline = Date().addingTimeInterval(overallTimeout)
        while Date() < deadline {
            let response = try await send(NiimbotCommands.printStatus(), expect: NiimbotResponseCommand.printStatus)
            if let parsed = NiimbotCommands.parsePrintStatus(response.data) {
                printerLog.debug("status page=\(parsed.page) print=\(parsed.printProgress)% feed=\(parsed.feedProgress)%")
                let printerFraction = Double(max(parsed.printProgress, parsed.feedProgress)) / 100.0
                jobProgress = 0.5 + min(max(printerFraction, 0), 1) * 0.5
                jobProgressMessage = "Printing label…"
                if parsed.page >= totalPages { return }
            }
            try await Task.sleep(nanoseconds: 300_000_000)
        }
        throw PrinterError.timeout("print to finish")
    }

    // MARK: - BLE send helpers

    /// Writes a packet and, if `expect` is set, waits for a response packet with that command.
    @discardableResult
    private func send(_ packet: NiimbotPacket, expect command: UInt8?, timeout: TimeInterval = 6) async throws -> NiimbotResponse {
        if let command {
            async let response = awaitResponse(command: command, timeout: timeout)
            try await rawWrite(packet.toBytes())
            return try await response
        }
        try await rawWrite(packet.toBytes())
        return NiimbotResponse(command: 0, data: [])
    }

    private func rawWrite(_ bytes: [UInt8]) async throws {
        guard let peripheral, let channel else { throw PrinterError.channelNotFound }
        let data = Data(bytes)
        printerLog.debug(">> \(hexString(bytes), privacy: .public)")
        if channel.properties.contains(.write) {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
                writeCont = cont
                peripheral.writeValue(data, for: channel, type: .withResponse)
            }
        } else {
            peripheral.writeValue(data, for: channel, type: .withoutResponse)
        }
    }

    private func awaitResponse(command: UInt8, timeout: TimeInterval) async throws -> NiimbotResponse {
        responseWaiterSeq &+= 1
        let id = responseWaiterSeq
        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<NiimbotResponse, Error>) in
            responseWaiter = (id, command, cont)
            // Inherits the main actor; fires the timeout only if this waiter is still pending.
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                guard let self, let waiter = self.responseWaiter, waiter.id == id else { return }
                self.responseWaiter = nil
                waiter.cont.resume(throwing: PrinterError.timeout("printer response 0x\(String(command, radix: 16))"))
            }
        }
    }

    // MARK: - Connection

    private func waitPoweredOn() async throws {
        switch central.state {
        case .poweredOn: return
        case .unauthorized: throw PrinterError.bluetoothUnavailable
        case .unsupported: throw PrinterError.bluetoothUnavailable
        default: break
        }
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            poweredOnWaiters.append(cont)
        }
    }

    private func resolvePeripheral(id: UUID) throws -> CBPeripheral {
        if let p = central.retrievePeripherals(withIdentifiers: [id]).first { return p }
        if let p = discovered.first(where: { $0.id == id }), let known = knownPeripheral, known.identifier == p.id { return known }
        throw PrinterError.notFound
    }

    private var knownPeripheral: CBPeripheral?

    /// Connects, discovers the service/characteristic, and stores it in `channel`.
    private func connectAndDiscover(_ target: CBPeripheral) async throws {
        peripheral = target
        target.delegate = self
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            connectCont = cont
            central.connect(target)
        }
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            discoverCont = cont
            target.discoverServices([Self.serviceUUID])
        }
    }

    private func disconnect() {
        if let peripheral { central.cancelPeripheralConnection(peripheral) }
        peripheral = nil
        channel = nil
        rxBuffer = []
    }
}

// MARK: - PNG decode

struct MonoImage {
    let width: Int
    let height: Int
    let isBlack: (Int, Int) -> Bool
}

extension NiimbotPrinter {
    /// Decodes a PNG into a top-origin monochrome image, padding the width up to a multiple of 8.
    static func decodeMono(pngData: Data, threshold: UInt8 = 128) -> MonoImage? {
        guard let src = CGImageSourceCreateWithData(pngData as CFData, nil),
              let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
        let width = cg.width
        let height = cg.height
        guard width > 0, height > 0 else { return nil }
        let paddedWidth = (width + 7) / 8 * 8

        var gray = [UInt8](repeating: 0xFF, count: paddedWidth * height) // white background
        let space = CGColorSpaceCreateDeviceGray()
        guard let ctx = CGContext(data: &gray, width: paddedWidth, height: height,
                                  bitsPerComponent: 8, bytesPerRow: paddedWidth, space: space,
                                  bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        ctx.setFillColor(gray: 1, alpha: 1)
        ctx.fill(CGRect(x: 0, y: 0, width: paddedWidth, height: height))
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))

        // CoreGraphics origin is bottom-left; flip Y so row 0 is the top of the label.
        return MonoImage(width: paddedWidth, height: height) { x, y in
            guard x >= 0, x < paddedWidth, y >= 0, y < height else { return false }
            let flipped = height - 1 - y
            return gray[flipped * paddedWidth + x] < threshold
        }
    }
}

// MARK: - CBCentralManagerDelegate

extension NiimbotPrinter: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            let waiters = poweredOnWaiters
            poweredOnWaiters = []
            waiters.forEach { $0.resume() }
            if status == .unknown { status = .idle }
        case .poweredOff:
            status = .poweredOff
            failAll(PrinterError.bluetoothUnavailable)
        case .unauthorized:
            status = .unauthorized
            failAll(PrinterError.bluetoothUnavailable)
        default:
            break
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard NiimbotDiscovery.isLikelyPrinter(peripheralName: peripheral.name, advertisementData: advertisementData) else {
            return
        }
        knownPeripheral = peripheral
        let name = NiimbotDiscovery.normalizedName(peripheralName: peripheral.name, advertisementData: advertisementData) ?? "NIIMBOT printer"
        if !discovered.contains(where: { $0.id == peripheral.identifier }) {
            printerLog.info("discovered \(name, privacy: .public) [\(peripheral.identifier.uuidString, privacy: .public)] rssi=\(RSSI)")
            discovered.append(Found(id: peripheral.identifier, name: name))
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectCont?.resume()
        connectCont = nil
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        connectCont?.resume(throwing: error ?? PrinterError.notFound)
        connectCont = nil
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if let error { failAll(error) }
    }

    private func failAll(_ error: Error) {
        connectCont?.resume(throwing: error); connectCont = nil
        discoverCont?.resume(throwing: error); discoverCont = nil
        writeCont?.resume(throwing: error); writeCont = nil
        responseWaiter?.cont.resume(throwing: error); responseWaiter = nil
        let waiters = poweredOnWaiters; poweredOnWaiters = []
        waiters.forEach { $0.resume(throwing: error) }
    }
}

// MARK: - CBPeripheralDelegate

extension NiimbotPrinter: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error { discoverCont?.resume(throwing: error); discoverCont = nil; return }
        guard let service = peripheral.services?.first(where: { $0.uuid == Self.serviceUUID }) else {
            discoverCont?.resume(throwing: PrinterError.channelNotFound); discoverCont = nil; return
        }
        peripheral.discoverCharacteristics(nil, for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error { discoverCont?.resume(throwing: error); discoverCont = nil; return }
        // The printer exposes one characteristic that supports both notify and write.
        guard let ch = service.characteristics?.first(where: {
            $0.properties.contains(.notify) && ($0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse))
        }) else {
            discoverCont?.resume(throwing: PrinterError.channelNotFound); discoverCont = nil; return
        }
        peripheral.setNotifyValue(true, for: ch)
        channel = ch
        discoverCont?.resume()
        discoverCont = nil
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error { writeCont?.resume(throwing: error) } else { writeCont?.resume() }
        writeCont = nil
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, let value = characteristic.value else { return }
        rxBuffer.append(contentsOf: [UInt8](value))
        printerLog.debug("<< \(hexString([UInt8](value)), privacy: .public)")
        let (packets, remainder) = NiimbotPacketParser.extract(from: rxBuffer)
        rxBuffer = remainder
        for packet in packets {
            if let waiter = responseWaiter, waiter.command == packet.command {
                responseWaiter = nil
                waiter.cont.resume(returning: packet)
            }
        }
    }
}
