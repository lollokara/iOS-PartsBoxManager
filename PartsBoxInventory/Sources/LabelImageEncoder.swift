import Foundation

/// One encoded scan line. `data == nil` means a blank (void) row.
struct EncodedRow: Equatable {
    let rowNumber: Int
    let repeatCount: Int
    let data: [UInt8]?
    let blackCount: Int
}

struct EncodedImage: Equatable {
    let cols: Int
    let rows: Int
    let rowsData: [EncodedRow]
}

struct LabelPrintTransform: Equatable {
    var rotate180: Bool
    var mirrorHorizontally: Bool
    /// Positive values shift the print down, negative values shift it up.
    var verticalOffsetRows: Int
}

/// Encodes a monochrome label into NIIMBOT row data, matching
/// `ImageEncoder.encodeCanvas` for `printDirection: "top"` and applying
/// printer-side transforms only at send time.
/// Identical consecutive rows are collapsed via `repeatCount`; blank rows become void.
enum LabelImageEncoder {
    /// - Parameters:
    ///   - width: image width in pixels; **must be a multiple of 8** (printhead column packing).
    ///   - height: image height in pixels.
    ///   - isBlack: returns true for a printed (black) pixel at (x, y).
    static func encode(
        width: Int,
        height: Int,
        transform: LabelPrintTransform = .init(rotate180: false, mirrorHorizontally: false, verticalOffsetRows: 0),
        isBlack: (Int, Int) -> Bool
    ) -> EncodedImage {
        precondition(width % 8 == 0, "width must be a multiple of 8")
        let cols = width
        let rows = height
        var rowsData: [EncodedRow] = []

        for row in 0..<rows {
            var isVoid = true
            var blackCount = 0
            var rowData = [UInt8](repeating: 0, count: cols / 8)
            let sourceRow = transform.rotate180
                ? (height - 1 - row + transform.verticalOffsetRows)
                : (row - transform.verticalOffsetRows)

            for colOct in 0..<(cols / 8) {
                var octet: UInt8 = 0
                for colBit in 0..<8 {
                    let baseX = colOct * 8 + colBit
                    let rotatedX = transform.rotate180 ? (width - 1 - baseX) : baseX
                    let sampleX = transform.mirrorHorizontally ? (width - 1 - rotatedX) : rotatedX
                    let sampleY = sourceRow
                    guard sampleY >= 0, sampleY < height else { continue }
                    if isBlack(sampleX, sampleY) {
                        octet |= UInt8(1 << (7 - colBit)) // MSB = leftmost pixel
                        isVoid = false
                        blackCount += 1
                    }
                }
                rowData[colOct] = octet
            }

            let newRow = EncodedRow(rowNumber: row, repeatCount: 1, data: isVoid ? nil : rowData, blackCount: blackCount)

            if let last = rowsData.last, last.data == newRow.data {
                rowsData[rowsData.count - 1] = EncodedRow(
                    rowNumber: last.rowNumber,
                    repeatCount: last.repeatCount + 1,
                    data: last.data,
                    blackCount: last.blackCount
                )
            } else {
                rowsData.append(newRow)
            }
        }

        return EncodedImage(cols: cols, rows: rows, rowsData: rowsData)
    }

    /// Maps encoded rows to the wire packets for a page body (writeImageData equivalent).
    static func imagePackets(_ image: EncodedImage, printheadPixels: Int) -> [NiimbotPacket] {
        image.rowsData.map { r in
            if let data = r.data {
                return NiimbotCommands.printBitmapRow(pos: r.rowNumber, repeats: r.repeatCount, rowData: data, printheadPixels: printheadPixels)
            }
            return NiimbotCommands.printEmptySpace(pos: r.rowNumber, repeats: r.repeatCount)
        }
    }
}
