import CoreBluetooth
import Foundation

enum NiimbotDiscovery {
    static let serviceUUID = CBUUID(string: "e7810a71-73ae-499d-8c15-faa9aef0c3f2")

    /// NIIMBOT printers often advertise a family prefix instead of a model-specific name.
    /// The service UUID is still useful as a positive signal when it is present.
    static func isLikelyPrinter(peripheralName: String?, advertisementData: [String: Any]) -> Bool {
        if advertisementDataServiceUUIDs(from: advertisementData).contains(serviceUUID) {
            return true
        }

        guard let name = normalizedName(peripheralName: peripheralName, advertisementData: advertisementData) else {
            return false
        }

        let upper = name.uppercased()
        return upper.contains("NIIMBOT")
            || upper.hasPrefix("B1")
            || upper.hasPrefix("B2")
            || upper.hasPrefix("D1")
            || upper.hasPrefix("M2")
    }

    static func normalizedName(peripheralName: String?, advertisementData: [String: Any]) -> String? {
        let candidates = [
            peripheralName,
            advertisementData[CBAdvertisementDataLocalNameKey] as? String
        ]

        for candidate in candidates {
            let trimmed = candidate?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let trimmed, !trimmed.isEmpty {
                return trimmed
            }
        }

        return nil
    }

    private static func advertisementDataServiceUUIDs(from advertisementData: [String: Any]) -> [CBUUID] {
        advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
    }
}
