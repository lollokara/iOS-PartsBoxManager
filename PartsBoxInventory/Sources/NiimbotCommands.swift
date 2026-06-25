import Foundation

/// RequestCommandId values used for the B1 print flow (from `packets/commands.js`).
enum NiimbotCommand {
    static let printStart: UInt8 = 1
    static let pageStart: UInt8 = 3
    static let setPageSize: UInt8 = 19
    static let setDensity: UInt8 = 33
    static let setLabelType: UInt8 = 35
    static let printEmptyRow: UInt8 = 132
    static let printBitmapRow: UInt8 = 133
    static let printStatus: UInt8 = 163
    static let pageEnd: UInt8 = 227
    static let printEnd: UInt8 = 243
}

/// ResponseCommandId values we parse.
enum NiimbotResponseCommand {
    static let printStatus: UInt8 = 179 // In_PrintStatus
}

enum LabelType: UInt8 {
    case withGaps = 1
}

/// Packet builders for the B1 print sequence, ported from `packets/packet_generator.js`.
/// Note: niimbluelib's `mapped()` defaults empty payloads to a single `0x01` byte, so the
/// "no-arg" commands (pageStart/pageEnd/printEnd/printStatus) carry `[0x01]`.
enum NiimbotCommands {
    static func u16(_ n: Int) -> [UInt8] {
        [UInt8((n >> 8) & 0xFF), UInt8(n & 0xFF)] // big-endian
    }

    static func setDensity(_ value: UInt8) -> NiimbotPacket {
        NiimbotPacket(command: NiimbotCommand.setDensity, data: [value])
    }

    static func setLabelType(_ value: UInt8) -> NiimbotPacket {
        NiimbotPacket(command: NiimbotCommand.setLabelType, data: [value])
    }

    static func printStart7b(totalPages: Int, color: UInt8 = 0) -> NiimbotPacket {
        NiimbotPacket(command: NiimbotCommand.printStart, data: u16(totalPages) + [0, 0, 0, 0, color])
    }

    static func pageStart() -> NiimbotPacket {
        NiimbotPacket(command: NiimbotCommand.pageStart, data: [1])
    }

    static func setPageSize6b(rows: Int, cols: Int, copies: Int) -> NiimbotPacket {
        NiimbotPacket(command: NiimbotCommand.setPageSize, data: u16(rows) + u16(cols) + u16(copies))
    }

    static func pageEnd() -> NiimbotPacket {
        NiimbotPacket(command: NiimbotCommand.pageEnd, data: [1])
    }

    static func printEnd() -> NiimbotPacket {
        NiimbotPacket(command: NiimbotCommand.printEnd, data: [1])
    }

    static func printStatus() -> NiimbotPacket {
        NiimbotPacket(command: NiimbotCommand.printStatus, data: [1])
    }

    static func printEmptySpace(pos: Int, repeats: Int) -> NiimbotPacket {
        NiimbotPacket(command: NiimbotCommand.printEmptyRow, data: u16(pos) + [UInt8(repeats & 0xFF)])
    }

    static func printBitmapRow(pos: Int, repeats: Int, rowData: [UInt8], printheadPixels: Int) -> NiimbotPacket {
        let counts = countPixelsForBitmapPacket(rowData, printheadPixels: printheadPixels)
        let data = u16(pos) + counts + [UInt8(repeats & 0xFF)] + rowData
        return NiimbotPacket(command: NiimbotCommand.printBitmapRow, data: data)
    }

    /// Ported from `Utils.countPixelsForBitmapPacket` ("auto" mode): three count bytes —
    /// per-third black counts when the row fits in three chunks, else `[0, lo, hi]` of the total.
    static func countPixelsForBitmapPacket(_ buf: [UInt8], printheadPixels: Int) -> [UInt8] {
        var total = 0
        var parts = [0, 0, 0]
        let chunkSize = printheadPixels / 8 / 3
        let split = chunkSize > 0 && buf.count <= chunkSize * 3

        for (byteN, value) in buf.enumerated() {
            let chunkIdx = chunkSize > 0 ? byteN / chunkSize : 3
            for bitN in 0..<8 where (value & (1 << bitN)) != 0 {
                total += 1
                if split && chunkIdx <= 2 { parts[chunkIdx] += 1 }
            }
        }

        if split {
            return [UInt8(parts[0] & 0xFF), UInt8(parts[1] & 0xFF), UInt8(parts[2] & 0xFF)]
        }
        return [0, UInt8(total & 0xFF), UInt8((total >> 8) & 0xFF)]
    }

    /// Parses an In_PrintStatus payload into (page, printProgress, feedProgress).
    /// page = i16 big-endian, then two i8 progress bytes.
    static func parsePrintStatus(_ data: [UInt8]) -> (page: Int, printProgress: Int, feedProgress: Int)? {
        guard data.count >= 4 else { return nil }
        let page = Int(data[0]) << 8 | Int(data[1])
        return (page, Int(data[2]), Int(data[3]))
    }
}
