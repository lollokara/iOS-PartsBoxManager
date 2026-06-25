// Standalone test runner for the Foundation-only printer logic.
// Compiled together with the pure source files (NOT part of the app target):
//   xcrun swiftc PartsBoxInventory/Sources/NiimbotPacket.swift \
//                PartsBoxInventory/Sources/NiimbotCommands.swift \
//                PartsBoxInventory/Sources/LabelPaperSize.swift \
//                PartsBoxInventory/Sources/LabelImageEncoder.swift \
//                PartsBoxInventory/PrinterKitTests/run_tests.swift -o /tmp/printerkit_tests
// Reference byte vectors were generated from @mmote/niimbluelib's PacketGenerator.

import Foundation
import CoreBluetooth

var failures = 0
func check(_ name: String, _ got: String, _ want: String) {
    if got == want {
        print("ok   - \(name)")
    } else {
        failures += 1
        print("FAIL - \(name)\n        got:  \(got)\n        want: \(want)")
    }
}
func hex(_ bytes: [UInt8]) -> String { bytes.map { String(format: "%02x", $0) }.joined(separator: " ") }
func hex(_ p: NiimbotPacket) -> String { hex(p.toBytes()) }

// --- Discovery filter ---
do {
    check(
        "discover by service UUID",
        "\(NiimbotDiscovery.isLikelyPrinter(peripheralName: "Random device", advertisementData: [CBAdvertisementDataServiceUUIDsKey: [NiimbotDiscovery.serviceUUID]]))",
        "true"
    )
    check(
        "discover by NIIMBOT name",
        "\(NiimbotDiscovery.isLikelyPrinter(peripheralName: "NIIMBOT M2", advertisementData: [:]))",
        "true"
    )
    check(
        "discover by printer family prefix",
        "\(NiimbotDiscovery.isLikelyPrinter(peripheralName: "M2-ABC123", advertisementData: [:]))",
        "true"
    )
    check(
        "reject unrelated device",
        "\(NiimbotDiscovery.isLikelyPrinter(peripheralName: "AirPods", advertisementData: [:]))",
        "false"
    )
}

// --- Packet builders vs niimbluelib ground truth ---
check("setDensity(3)", hex(NiimbotCommands.setDensity(3)), "55 55 21 01 03 23 aa aa")
check("setLabelType(WithGaps)", hex(NiimbotCommands.setLabelType(LabelType.withGaps.rawValue)), "55 55 23 01 01 23 aa aa")
check("printStart7b(1)", hex(NiimbotCommands.printStart7b(totalPages: 1)), "55 55 01 07 00 01 00 00 00 00 00 07 aa aa")
check("pageStart()", hex(NiimbotCommands.pageStart()), "55 55 03 01 01 03 aa aa")
check("setPageSize6b(177,360,1)", hex(NiimbotCommands.setPageSize6b(rows: 177, cols: 360, copies: 1)), "55 55 13 06 00 b1 01 68 00 01 cc aa aa")
check("pageEnd()", hex(NiimbotCommands.pageEnd()), "55 55 e3 01 01 e3 aa aa")
check("printEnd()", hex(NiimbotCommands.printEnd()), "55 55 f3 01 01 f3 aa aa")
check("printStatus()", hex(NiimbotCommands.printStatus()), "55 55 a3 01 01 a3 aa aa")
check("printEmptySpace(5,2)", hex(NiimbotCommands.printEmptySpace(pos: 5, repeats: 2)), "55 55 84 03 00 05 02 80 aa aa")
check("printBitmapRow(7,1,[0x81,0x3c],384)",
      hex(NiimbotCommands.printBitmapRow(pos: 7, repeats: 1, rowData: [0x81, 0x3c], printheadPixels: 384)),
      "55 55 85 08 00 07 06 00 00 01 81 3c 30 aa aa")

// --- Response parsing round-trip + framing ---
do {
    let bytes = NiimbotCommands.printStatus().toBytes() // reuse as a framed packet
    let (packets, remainder) = NiimbotPacketParser.extract(from: bytes)
    check("parse one packet count", "\(packets.count)", "1")
    check("parse command", "\(packets.first?.command ?? 0)", "163")
    check("parse remainder empty", "\(remainder.count)", "0")
}
do {
    // Two packets back-to-back plus a trailing partial head.
    let two = NiimbotCommands.pageEnd().toBytes() + NiimbotCommands.printEnd().toBytes() + [0x55]
    let (packets, remainder) = NiimbotPacketParser.extract(from: two)
    check("parse two packets", "\(packets.count)", "2")
    check("parse keeps partial head", hex(remainder), "55")
}
do {
    // In_PrintStatus payload: page=1, print=100, feed=100
    let parsed = NiimbotCommands.parsePrintStatus([0x00, 0x01, 0x64, 0x64])
    check("parsePrintStatus page", "\(parsed?.page ?? -1)", "1")
    check("parsePrintStatus progress", "\(parsed?.printProgress ?? -1)/\(parsed?.feedProgress ?? -1)", "100/100")
}

// --- Image encoder ---
do {
    // 8x3 all white -> single void row, repeat 3.
    let img = LabelImageEncoder.encode(width: 8, height: 3) { _, _ in false }
    check("void collapse rows", "\(img.rowsData.count)", "1")
    check("void collapse repeat", "\(img.rowsData[0].repeatCount)", "3")
    check("void row data nil", "\(img.rowsData[0].data == nil)", "true")
}
do {
    // 8x2: row0 white, row1 single black pixel at x=0 -> 0x80.
    let img = LabelImageEncoder.encode(width: 8, height: 2) { x, y in y == 1 && x == 0 }
    check("mixed rows count", "\(img.rowsData.count)", "2")
    check("mixed void first", "\(img.rowsData[0].data == nil)", "true")
    check("mixed pixel byte", hex(img.rowsData[1].data ?? []), "80")
    check("mixed pixel blackCount", "\(img.rowsData[1].blackCount)", "1")

    let packets = LabelImageEncoder.imagePackets(img, printheadPixels: 384)
    check("imagePackets emptyspace", hex(packets[0]), "55 55 84 03 00 00 01 86 aa aa")
    // printBitmapRow(1,1,[0x80],384): counts split -> parts=[1,0,0]
    check("imagePackets bitmaprow", hex(packets[1]), "55 55 85 07 00 01 01 00 00 01 80 03 aa aa")
}
do {
    let rotated = LabelImageEncoder.encode(
        width: 8,
        height: 2,
        transform: .init(rotate180: true, mirrorHorizontally: false, verticalOffsetRows: 0)
    ) { x, y in y == 0 && x == 0 }
    check("rotate 180 row count", "\(rotated.rowsData.count)", "2")
    check("rotate 180 top row blank", "\(rotated.rowsData[0].data == nil)", "true")
    check("rotate 180 bottom-right byte", hex(rotated.rowsData[1].data ?? []), "01")
}
do {
    let mirrored = LabelImageEncoder.encode(
        width: 8,
        height: 1,
        transform: .init(rotate180: false, mirrorHorizontally: true, verticalOffsetRows: 0)
    ) { x, _ in x == 0 }
    check("mirror horizontal byte", hex(mirrored.rowsData[0].data ?? []), "01")
}
do {
    let offset = LabelImageEncoder.encode(
        width: 8,
        height: 2,
        transform: .init(rotate180: false, mirrorHorizontally: false, verticalOffsetRows: 1)
    ) { x, y in y == 0 && x == 0 }
    check("vertical offset row count", "\(offset.rowsData.count)", "2")
    check("vertical offset first row blank", "\(offset.rowsData[0].data == nil)", "true")
    check("vertical offset second row byte", hex(offset.rowsData[1].data ?? []), "80")
}

// --- Paper size selection ---
do {
    check("paper size raw value", LabelPaperSize.mm40x15.rawValue, "40x15")
    check("paper size display name", LabelPaperSize.mm30x20.displayName, "30 x 20 mm")
    check("paper size pixels", LabelPaperSize.mm50x30.pixelDimensionsDescription, "591x354")
}

print("\n\(failures == 0 ? "ALL PASS" : "\(failures) FAILURE(S)")")
exit(failures == 0 ? 0 : 1)
