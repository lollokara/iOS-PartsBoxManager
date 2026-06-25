import Foundation

/// A NIIMBOT wire packet: `[0x55,0x55, CMD, LEN, ...DATA, XOR, 0xAA,0xAA]`.
/// `XOR = CMD ^ LEN ^ each data byte`. Ported from `@mmote/niimbluelib` `packets/packet.js`.
struct NiimbotPacket: Equatable {
    let command: UInt8
    let data: [UInt8]

    static let head: [UInt8] = [0x55, 0x55]
    static let tail: [UInt8] = [0xAA, 0xAA]

    var checksum: UInt8 {
        var c: UInt8 = command ^ UInt8(data.count & 0xFF)
        for b in data { c ^= b }
        return c
    }

    func toBytes() -> [UInt8] {
        var out = NiimbotPacket.head
        out.append(command)
        out.append(UInt8(data.count & 0xFF))
        out.append(contentsOf: data)
        out.append(checksum)
        out.append(contentsOf: NiimbotPacket.tail)
        return out
    }
}

/// A response packet decoded from the printer's notification stream.
struct NiimbotResponse: Equatable {
    let command: UInt8
    let data: [UInt8]
}

/// Extracts complete framed packets from a rolling byte buffer.
enum NiimbotPacketParser {
    /// Returns the complete packets found in `buffer` and the unconsumed remainder
    /// (which may hold a partial packet awaiting more bytes).
    static func extract(from buffer: [UInt8]) -> (packets: [NiimbotResponse], remainder: [UInt8]) {
        var packets: [NiimbotResponse] = []
        var buf = buffer

        while true {
            guard let start = headIndex(in: buf) else {
                // Preserve a trailing lone 0x55 that might begin the next frame.
                if buf.last == 0x55 { return (packets, [0x55]) }
                return (packets, [])
            }
            if start > 0 { buf.removeFirst(start) }
            guard buf.count >= 4 else { return (packets, buf) } // head(2)+cmd(1)+len(1)

            let cmd = buf[2]
            let len = Int(buf[3])
            let total = 2 + 1 + 1 + len + 1 + 2 // head+cmd+len+data+checksum+tail
            guard buf.count >= total else { return (packets, buf) }

            let data = Array(buf[4..<(4 + len)])
            packets.append(NiimbotResponse(command: cmd, data: data))
            buf.removeFirst(total)
        }
    }

    private static func headIndex(in buf: [UInt8]) -> Int? {
        guard buf.count >= 2 else { return nil }
        var i = 0
        while i + 1 < buf.count {
            if buf[i] == 0x55 && buf[i + 1] == 0x55 { return i }
            i += 1
        }
        return nil
    }
}
