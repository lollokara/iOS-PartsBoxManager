@preconcurrency import Foundation
import Combine
import SwiftUI

@MainActor
final class SettingsStore: ObservableObject {
    @Published var settings: AppConnectionSettings {
        didSet {
            persist()
            refreshStoredAuthSessionIfNeeded(oldValue: oldValue)
        }
    }

    @Published private(set) var authSession: StoredAuthToken?
    @Published private(set) var authAvailability: AuthAvailability = .unknown
    @Published private(set) var authNotice: String?
    @Published private(set) var authRevision: Int = 0
    @Published var isOffline: Bool = false

    private let defaults: UserDefaults
    private let storageKey = "PartsBoxInventory.connectionSettings"
    private let authKeychain = KeychainHelper(service: "PartsBoxInventory.auth")

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.settings = defaults
            .data(forKey: storageKey)
            .flatMap { try? JSONDecoder().decode(AppConnectionSettings.self, from: $0) }
            ?? AppConnectionSettings()
        self.authSession = Self.loadStoredAuthSession(
            keychain: authKeychain,
            baseURL: normalizedURL(from: settings.activeBaseURL)
                ?? normalizedURL(from: settings.internalIP)
                ?? normalizedURL(from: settings.externalIP)
        )
    }

    func binding<Value>(_ keyPath: WritableKeyPath<AppConnectionSettings, Value>) -> Binding<Value> {
        Binding(
            get: {
                self.settings[keyPath: keyPath]
            },
            set: { newValue in
                var copy = self.settings
                copy[keyPath: keyPath] = newValue
                self.settings = copy
            }
        )
    }

    var resolvedBaseURL: URL? {
        normalizedURL(from: settings.activeBaseURL)
            ?? normalizedURL(from: settings.internalIP)
            ?? normalizedURL(from: settings.externalIP)
    }

    var apiClient: InventoryAPIClient? {
        guard let resolvedBaseURL else {
            return nil
        }
        return InventoryAPIClient(baseURL: resolvedBaseURL, token: authSession?.token)
    }

    var requiresLogin: Bool {
        authAvailability == .enabled && authSession == nil
    }

    func useDiscoveredServer(_ url: URL) {
        var copy = settings
        copy.activeBaseURL = url.absoluteString
        settings = copy
    }

    func rememberLastStorage(_ storageID: String) {
        let trimmed = storageID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return
        }
        var copy = settings
        copy.lastStorageID = trimmed
        settings = copy
    }

    func refreshAuthStatus() async {
        guard resolvedBaseURL != nil else {
            authAvailability = .unknown
            authNotice = nil
            return
        }

        guard let client = apiClient else {
            authAvailability = .unknown
            authNotice = "Set a base URL first."
            return
        }

        do {
            let response = try await client.fetchAuthStatus()
            authAvailability = response.availability

            switch response.availability {
            case .disabled:
                authNotice = response.serverMessage ?? "Authentication is disabled on this server."
            case .enabled:
                if authSession == nil {
                    authNotice = response.serverMessage ?? "Authentication is enabled. Log in to continue."
                } else {
                    authNotice = response.serverMessage
                }
            case .unknown:
                authNotice = response.serverMessage
            }

            if authSession == nil, response.tokenExpiration == nil, response.serverMessage == nil {
                authNotice = nil
            }
        } catch {
            authAvailability = .unknown
            authNotice = "Authentication status unavailable. Login may still work."
        }
    }

    func login(password: String) async {
        guard let client = apiClient else {
            authNotice = "Set a base URL first."
            return
        }

        do {
            let response = try await client.login(password: password)
            let session = StoredAuthToken(token: response.token, expiresAt: response.expiresAt)
            try persistAuthSession(session)
            authSession = session
            authAvailability = .enabled
            authNotice = "Signed in."
            authRevision += 1
        } catch {
            if case let InventoryAPIClient.ClientError.unauthorized(message) = error {
                authNotice = message ?? "Authentication failed. Check the password."
                authAvailability = .enabled
            } else {
                authNotice = message(for: error, fallback: "Could not log in.")
            }
        }
    }

    func logout() {
        clearAuthSession(bumpRevision: true)
        authNotice = "Signed out."
    }

    func handleAPIError(_ error: Error) -> String {
        if let clientError = error as? InventoryAPIClient.ClientError {
            if clientError.isUnauthorized {
                clearAuthSession(bumpRevision: true)
                authAvailability = .enabled
                let message = clientError.errorDescription ?? "Authentication required. Please log in again."
                authNotice = message
                return message
            }
            return clientError.errorDescription ?? "Unexpected server error."
        }
        return error.localizedDescription
    }

    private func refreshStoredAuthSessionIfNeeded(oldValue: AppConnectionSettings) {
        let oldBaseURL = normalizedURL(from: oldValue.activeBaseURL)
            ?? normalizedURL(from: oldValue.internalIP)
            ?? normalizedURL(from: oldValue.externalIP)
        let newBaseURL = resolvedBaseURL

        guard oldBaseURL?.absoluteString != newBaseURL?.absoluteString else {
            return
        }

        authAvailability = .unknown
        authNotice = nil
        authSession = Self.loadStoredAuthSession(keychain: authKeychain, baseURL: newBaseURL)
        authRevision += 1
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(settings) else {
            return
        }
        defaults.set(data, forKey: storageKey)
    }

    private func persistAuthSession(_ session: StoredAuthToken) throws {
        guard let baseURL = resolvedBaseURL else {
            return
        }
        let data = try JSONEncoder().encode(session)
        try authKeychain.writeData(data, account: authStorageAccount(for: baseURL))
    }

    private func clearAuthSession(bumpRevision: Bool = false) {
        authSession = nil
        if bumpRevision {
            authRevision += 1
        }
        guard let baseURL = resolvedBaseURL else {
            return
        }
        try? authKeychain.deleteData(account: authStorageAccount(for: baseURL))
    }

    private static func loadStoredAuthSession(
        keychain: KeychainHelper,
        baseURL: URL?
    ) -> StoredAuthToken? {
        guard let baseURL else {
            return nil
        }
        let account = authStorageAccount(for: baseURL)
        guard let data = try? keychain.readData(account: account) else {
            return nil
        }
        return try? JSONDecoder().decode(StoredAuthToken.self, from: data)
    }

    private func authStorageAccount(for baseURL: URL) -> String {
        Self.authStorageAccount(for: baseURL)
    }

    private static func authStorageAccount(for baseURL: URL) -> String {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        let scheme = (components?.scheme ?? baseURL.scheme ?? "http").lowercased()
        let host = (components?.host ?? baseURL.host ?? baseURL.absoluteString).lowercased()
        let port = components?.port.map { ":\($0)" } ?? ""
        let path = (components?.path ?? baseURL.path).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let normalizedPath = path.isEmpty ? "" : "/" + path
        return "\(scheme)://\(host)\(port)\(normalizedPath)"
    }

    private func message(for error: Error, fallback: String) -> String {
        if let clientError = error as? InventoryAPIClient.ClientError {
            return clientError.errorDescription ?? fallback
        }
        return error.localizedDescription.isEmpty ? fallback : error.localizedDescription
    }

    // MARK: - Offline Cache Helpers
    private var cacheDir: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
    }

    func setOffline(_ offline: Bool) {
        if isOffline != offline {
            isOffline = offline
        }
    }

    func cacheParts(section: InventorySection, parts: [MobilePartRowDTO]) {
        guard let url = cacheDir?.appendingPathComponent("parts_\(section.rawValue).json") else { return }
        do {
            let data = try JSONEncoder().encode(parts)
            try data.write(to: url, options: .atomic)
        } catch {
            print("Failed to cache parts for \(section): \(error)")
        }
    }

    func getCachedParts(section: InventorySection) -> [MobilePartRowDTO]? {
        guard let url = cacheDir?.appendingPathComponent("parts_\(section.rawValue).json") else { return nil }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode([MobilePartRowDTO].self, from: data)
        } catch {
            return nil
        }
    }

    func cacheStorage(storage: [MobileStorageDTO]) {
        guard let url = cacheDir?.appendingPathComponent("storage.json") else { return }
        do {
            let data = try JSONEncoder().encode(storage)
            try data.write(to: url, options: .atomic)
        } catch {
            print("Failed to cache storage: \(error)")
        }
    }

    func getCachedStorage() -> [MobileStorageDTO]? {
        guard let url = cacheDir?.appendingPathComponent("storage.json") else { return nil }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode([MobileStorageDTO].self, from: data)
        } catch {
            return nil
        }
    }

    func cacheUncategorized(parts: [MobilePartRowDTO]) {
        guard let url = cacheDir?.appendingPathComponent("uncategorized.json") else { return }
        do {
            let data = try JSONEncoder().encode(parts)
            try data.write(to: url, options: .atomic)
        } catch {
            print("Failed to cache uncategorized parts: \(error)")
        }
    }

    func getCachedUncategorized() -> [MobilePartRowDTO]? {
        guard let url = cacheDir?.appendingPathComponent("uncategorized.json") else { return nil }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode([MobilePartRowDTO].self, from: data)
        } catch {
            return nil
        }
    }

    func cachePartDetail(partID: String, detail: MobilePartDetailDTO) {
        guard let url = cacheDir?.appendingPathComponent("part_detail_\(partID).json") else { return }
        do {
            let data = try JSONEncoder().encode(detail)
            try data.write(to: url, options: .atomic)
        } catch {
            print("Failed to cache part detail: \(error)")
        }
    }

    func getCachedPartDetail(partID: String) -> MobilePartDetailDTO? {
        guard let url = cacheDir?.appendingPathComponent("part_detail_\(partID).json") else { return nil }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(MobilePartDetailDTO.self, from: data)
        } catch {
            return nil
        }
    }

    func cacheStorageParts(storageID: String, parts: [MobilePartRowDTO]) {
        guard let url = cacheDir?.appendingPathComponent("storage_parts_\(storageID).json") else { return }
        do {
            let data = try JSONEncoder().encode(parts)
            try data.write(to: url, options: .atomic)
        } catch {
            print("Failed to cache storage parts: \(error)")
        }
    }

    func getCachedStorageParts(storageID: String) -> [MobilePartRowDTO]? {
        guard let url = cacheDir?.appendingPathComponent("storage_parts_\(storageID).json") else { return nil }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode([MobilePartRowDTO].self, from: data)
        } catch {
            return nil
        }
    }

    func cacheHistory(history: [HistoryEntryDTO]) {
        guard let url = cacheDir?.appendingPathComponent("history.json") else { return }
        do {
            let data = try JSONEncoder().encode(history)
            try data.write(to: url, options: .atomic)
        } catch {
            print("Failed to cache history: \(error)")
        }
    }

    func getCachedHistory() -> [HistoryEntryDTO]? {
        guard let url = cacheDir?.appendingPathComponent("history.json") else { return nil }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode([HistoryEntryDTO].self, from: data)
        } catch {
            return nil
        }
    }

    func isNetworkError(_ error: Error) -> Bool {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            switch nsError.code {
            case NSURLErrorCannotFindHost,
                 NSURLErrorCannotConnectToHost,
                 NSURLErrorNetworkConnectionLost,
                 NSURLErrorDNSLookupFailed,
                 NSURLErrorResourceUnavailable,
                 NSURLErrorNotConnectedToInternet,
                 NSURLErrorTimedOut:
                return true
            default:
                return false
            }
        }
        return false
    }
}

private func normalizedURL(from rawValue: String) -> URL? {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
        return nil
    }

    if let url = URL(string: trimmed), url.scheme != nil {
        return url
    }

    let candidate = "http://\(trimmed)"
    return URL(string: candidate)
}

@MainActor
final class ServerDiscovery: NSObject, ObservableObject {
    @Published var isSearching = false
    @Published var discoveredURL: URL?
    @Published var message: String?

    private let browser = NetServiceBrowser()
    private var services: [NetService] = []

    override init() {
        super.init()
        browser.delegate = self
    }

    func search() {
        services.removeAll()
        discoveredURL = nil
        message = "Searching local network…"
        isSearching = true
        browser.stop()
        browser.searchForServices(ofType: "_partsbox-manager._tcp.", inDomain: "local.")
    }

    func stop() {
        browser.stop()
        services.forEach { $0.stop() }
        services.removeAll()
        isSearching = false
    }
}

extension ServerDiscovery: @preconcurrency NetServiceBrowserDelegate, @preconcurrency NetServiceDelegate {
    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        service.delegate = self
        services.append(service)
        service.resolve(withTimeout: 5)
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
        isSearching = false
        message = "Discovery failed."
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        guard discoveredURL == nil else {
            return
        }
        let host = sender.hostName?.trimmingCharacters(in: CharacterSet(charactersIn: ".")) ?? sender.name
        guard sender.port > 0, let url = URL(string: "http://\(host):\(sender.port)") else {
            message = "Found server, but could not build URL."
            return
        }
        discoveredURL = url
        message = "Found \(url.absoluteString)"
        stop()
    }

    func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
        if discoveredURL == nil {
            message = "Found a server but could not resolve its address."
        }
    }
}
