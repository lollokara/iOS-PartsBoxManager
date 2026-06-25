import Foundation
import SwiftUI

enum InventorySection: String, CaseIterable, Codable, Identifiable {
    case active
    case resistor
    case capacitor
    case inductor
    case other
    case manage

    var id: String { rawValue }

    var title: String {
        switch self {
        case .active:
            return "Actives"
        case .resistor:
            return "Resistors"
        case .capacitor:
            return "Capacitors"
        case .inductor:
            return "Inductors"
        case .other:
            return "Other"
        case .manage:
            return "Manage"
        }
    }

    var systemImage: String {
        switch self {
        case .active:
            return "bolt.fill"
        case .resistor:
            return "circle.grid.3x3.fill"
        case .capacitor:
            return "capsule.fill"
        case .inductor:
            return "waveform.path.ecg"
        case .other:
            return "square.grid.2x2.fill"
        case .manage:
            return "gearshape.fill"
        }
    }

    var isInventoryTab: Bool {
        self != .manage
    }
}

enum AuthAvailability: String, Codable, Equatable {
    case unknown
    case disabled
    case enabled
}

enum InventoryCategoryTaxonomy: String, CaseIterable, Codable, Identifiable {
    case resistor
    case capacitor
    case inductor
    case ic
    case mcu
    case opamp
    case regulator
    case mosfet
    case bjt
    case diodeLed = "diode-led"
    case crystalOscillator = "crystal-oscillator"
    case sensor
    case module
    case connector
    case switchButton = "switch-button"
    case cable
    case mechanical
    case toolConsumable = "tool-consumable"
    case other
    case uncategorized

    var id: String { rawValue }

    var label: String {
        switch self {
        case .resistor:
            return "Resistor"
        case .capacitor:
            return "Capacitor"
        case .inductor:
            return "Inductor"
        case .ic:
            return "IC"
        case .mcu:
            return "MCU"
        case .opamp:
            return "Op-Amp"
        case .regulator:
            return "Regulator"
        case .mosfet:
            return "MOSFET"
        case .bjt:
            return "BJT"
        case .diodeLed:
            return "Diode/LED"
        case .crystalOscillator:
            return "Crystal/Oscillator"
        case .sensor:
            return "Sensor"
        case .module:
            return "Module"
        case .connector:
            return "Connector"
        case .switchButton:
            return "Switch/Button"
        case .cable:
            return "Cable"
        case .mechanical:
            return "Mechanical"
        case .toolConsumable:
            return "Tool/Consumable"
        case .other:
            return "Other"
        case .uncategorized:
            return "Uncategorized"
        }
    }

    var section: InventorySection {
        switch self {
        case .resistor:
            return .resistor
        case .capacitor:
            return .capacitor
        case .inductor:
            return .inductor
        case .ic, .mcu, .opamp, .regulator, .mosfet, .bjt, .diodeLed, .crystalOscillator, .sensor, .module:
            return .active
        case .connector, .switchButton, .cable, .mechanical, .toolConsumable, .other, .uncategorized:
            return .other
        }
    }

    var sectionLabel: String {
        switch section {
        case .active:
            return "Active"
        case .resistor:
            return "Resistor"
        case .capacitor:
            return "Capacitor"
        case .inductor:
            return "Inductor"
        case .other, .manage:
            return "Other"
        }
    }
}

struct AppConnectionSettings: Codable, Equatable {
    var internalIP: String
    var externalIP: String
    var trustedSSID: String
    var activeBaseURL: String
    var lastStorageID: String?

    init(
        internalIP: String = "",
        externalIP: String = "",
        trustedSSID: String = "Casa!",
        activeBaseURL: String = "",
        lastStorageID: String? = nil
    ) {
        self.internalIP = internalIP
        self.externalIP = externalIP
        self.trustedSSID = trustedSSID
        self.activeBaseURL = activeBaseURL
        self.lastStorageID = lastStorageID
    }
}

struct StoredAuthToken: Codable, Equatable {
    let token: String
    let expiresAt: Double

    var expirationDate: Date {
        Date(timeIntervalSince1970: expiresAt / 1000)
    }
}

struct MobileAuthLoginRequest: Codable {
    let password: String
}

struct MobileAuthLoginResponse: Codable {
    let token: String
    let expiresAt: Double
}

struct MobileAuthStatusResponse: Codable {
    let enabled: Bool?
    let authEnabled: Bool?
    let authRequired: Bool?
    let authenticated: Bool?
    let loggedIn: Bool?
    let expiresAt: Double?
    let tokenExpiresAt: Double?
    let status: String?
    let message: String?

    var availability: AuthAvailability {
        if let enabled {
            return enabled ? .enabled : .disabled
        }
        if let authEnabled {
            return authEnabled ? .enabled : .disabled
        }
        if let authRequired {
            return authRequired ? .enabled : .disabled
        }

        if let status {
            let normalized = status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if normalized.contains("disable") || normalized.contains("off") {
                return .disabled
            }
            if normalized.contains("enable") || normalized.contains("require") {
                return .enabled
            }
        }

        if authenticated == true || loggedIn == true || expiresAt != nil || tokenExpiresAt != nil {
            return .enabled
        }

        return .unknown
    }

    var tokenExpiration: Double? {
        expiresAt ?? tokenExpiresAt
    }

    var serverMessage: String? {
        message?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            ?? status?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }
}

struct MobileSectionsResponse: Codable {
    let sections: [MobileSectionDTO]
}

struct MobileSectionDTO: Codable, Identifiable {
    let id: InventorySection
    let label: String
    let count: Int?
}

struct MobileStorageDTO: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let label: String?

    var displayName: String {
        label ?? name
    }
}

struct MobilePartsResponse: Codable {
    let section: InventorySection
    let parts: [MobilePartRowDTO]
}

struct MobilePartRowDTO: Codable, Identifiable {
    let id: String
    let section: InventorySection
    let value: String?
    let pn: String
    let quantity: Int
    let description: String
    let manufacturer: String?
    let category: String?
    let categoryLabel: String?
    let tags: [String]?
    let syncStatus: String?
    let syncError: String?
    let price: Double?
    let currency: String?
    let datasheetUrl: String?
    let tolerance: String?
    let voltage: String?
    let package: String?
}

struct MobilePartDetailDTO: Codable, Identifiable {
    let id: String
    let section: InventorySection
    let value: String?
    let pn: String
    let quantity: Int
    let description: String
    let manufacturer: String?
    let category: String?
    let categoryLabel: String?
    let tags: [String]?
    let syncStatus: String?
    let syncError: String?
    let locations: [MobilePartLocationDTO]
    let price: Double?
    let currency: String?
    let datasheetUrl: String?
    let tolerance: String?
    let voltage: String?
    let package: String?
}

struct MobilePartLocationDTO: Codable, Identifiable {
    let storageId: String
    let name: String
    let quantity: Int

    var id: String { storageId }
}

struct MobileStockAdjustRequest: Codable {
    let storageId: String
    let delta: Int
    let note: String?
}

struct MobileCreateStorageRequest: Codable {
    let name: String
}

struct MobileCreateStorageResponse: Codable {
    let id: String
    let storageId: String
    let name: String
    let label: String?
}

struct MobileDeleteStorageResponse: Codable {
    let ok: Bool
    let storageId: String
}

struct MobileStorageResponse: Codable {
    let storage: [MobileStorageDTO]
}

struct MobileUncategorizedPartsResponse: Codable {
    let parts: [MobilePartRowDTO]
    let totalStockValue: Double?
}

struct MobileCategoryUpdateRequest: Codable {
    let category: String
    let tag: String?
}

struct MobileCategoryUpdateResponse: Codable {
    let part: MobilePartDetailDTO?
    let sync: MobileSyncStatusDTO?
}

struct MobileSyncStatusDTO: Codable {
    let lastSyncedAt: Double?
    let error: String?
    let count: Int
    let pending: Bool?
}

struct MobileStockAdjustResponse: Codable {
    let part: MobilePartDetailDTO?
    let sync: MobileSyncStatusDTO
}

struct MobilePullDetailsResponse: Codable {
    let part: MobilePartDetailDTO?
    let sync: MobileSyncStatusDTO
}

struct MobileDeletePartResponse: Codable {
    let ok: Bool
    let partId: String
    let sync: MobileSyncStatusDTO
}

struct MobileScanParseRequest: Codable {
    let raw: String
}

struct MobileParsedScanLabelDTO: Codable {
    let vendor: String
    let raw: String
    let supplierPartNumber: String?
    let manufacturerPartNumber: String?
    let quantity: Int?
    let lotCode: String?
    let dateCode: String?
    let confidence: Double
    let warnings: [String]
}

struct MobileScanParseResponse: Codable {
    let parsed: MobileParsedScanLabelDTO
}

struct MobileScanEnrichResponse: Codable {
    let name: String?
    let description: String?
    let category: String?
    let categoryLabel: String?
    let section: String?
    let sectionLabel: String?
    let value: String?
    let tolerance: String?
    let voltage: String?
    let package: String?
    let manufacturer: String?
    let datasheetUrl: String?
}

struct MobileScanResolveRequest: Codable {
    let raw: String
}

struct MobileScanResolveResponse: Codable {
    let parsed: MobileParsedScanLabelDTO?
    let part: MobilePartDetailDTO?
    let storage: [MobileStorageDTO]?
}

struct MobileScanConfirmRequest: Codable {
    let raw: String
    let storageId: String?
    let name: String?
    let description: String?
    let category: String?
    let tag: String?
    let quantity: Int?
    let value: String?
    let tolerance: String?
    let voltage: String?
    let package: String?
    let manufacturer: String?
    let datasheetUrl: String?
}

struct MobileScanConfirmResponse: Codable {
    let partId: String
    let parsed: MobileParsedScanLabelDTO
    let sync: MobileSyncStatusDTO
}

struct MobileSyncResponse: Codable {
    let lastSyncedAt: Double?
    let error: String?
    let count: Int
    let pending: [MobilePendingMutationDTO]?
}

struct MobilePendingMutationDTO: Codable, Identifiable {
    let id: String
    let type: String
    let status: String
    let attempts: Int
    let localPartId: String?
    let remotePartId: String?
    let lastError: String?
}

extension InventoryCategoryTaxonomy {
    var tint: Color {
        switch self {
        case .ic, .mcu:
            return .indigo
        case .opamp, .regulator:
            return .teal
        case .mosfet, .bjt:
            return .orange
        case .diodeLed:
            return .pink
        case .crystalOscillator:
            return .cyan
        case .sensor:
            return .green
        case .module:
            return .purple
        case .resistor:
            return .brown
        case .capacitor:
            return .blue
        case .inductor:
            return .mint
        case .connector, .switchButton, .cable:
            return .yellow
        case .mechanical, .toolConsumable:
            return .gray
        case .other, .uncategorized:
            return .secondary
        }
    }
}

extension MobilePartRowDTO {
    var displayTags: [String] {
        (tags ?? [])
            .filter(isUserVisiblePartTag)
    }
}

extension MobilePartDetailDTO {
    var displayTags: [String] {
        (tags ?? [])
            .filter(isUserVisiblePartTag)
    }
}

private func isUserVisiblePartTag(_ tag: String) -> Bool {
    let normalized = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !normalized.isEmpty else {
        return false
    }
    if normalized.hasPrefix("pbm-category-") {
        return false
    }
    if normalized == "mobile-scan" || normalized == "digikey" || normalized == "lcsc" || normalized == "nexar" {
        return false
    }
    if normalized.hasPrefix("nexar-") {
        return false
    }
    return true
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

struct MobileStoragePartsResponse: Codable {
    let storageId: String
    let parts: [MobilePartRowDTO]
}

struct HistoryEntryDTO: Codable, Identifiable, Equatable {
    let id: String
    let timestamp: Double
    let type: String // "create-part", "stock-adjust", "delete-part", "category-change", "sync-local-to-cloud"
    let partId: String
    let partName: String
    let storageId: String?
    let storageName: String?
    let quantity: Int?
    let note: String?
    let status: String // "pending", "completed", "failed"
    let error: String?
    
    var date: Date {
        Date(timeIntervalSince1970: timestamp / 1000.0)
    }
}

struct MobileHistoryResponse: Codable {
    let history: [HistoryEntryDTO]
}
