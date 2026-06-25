import Foundation

/// Supported NIIMBOT label sizes for the manual printer selector.
enum LabelPaperSize: String, CaseIterable, Codable, Hashable, Identifiable {
    case mm30x15 = "30x15"
    case mm40x15 = "40x15"
    case mm50x30 = "50x30"
    case mm30x20 = "30x20"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .mm30x15: return "30 x 15 mm"
        case .mm40x15: return "40 x 15 mm"
        case .mm50x30: return "50 x 30 mm"
        case .mm30x20: return "30 x 20 mm"
        }
    }

    var widthMM: Double {
        switch self {
        case .mm30x15, .mm30x20: return 30
        case .mm40x15: return 40
        case .mm50x30: return 50
        }
    }

    var heightMM: Double {
        switch self {
        case .mm30x15, .mm40x15: return 15
        case .mm50x30: return 30
        case .mm30x20: return 20
        }
    }

    var pixelWidthAt300DPI: Int {
        Self.pixels(forMM: widthMM)
    }

    var pixelHeightAt300DPI: Int {
        Self.pixels(forMM: heightMM)
    }

    var pixelDimensionsDescription: String {
        "\(pixelWidthAt300DPI)x\(pixelHeightAt300DPI)"
    }

    private static func pixels(forMM mm: Double) -> Int {
        Int((mm * 300.0 / 25.4).rounded())
    }
}
