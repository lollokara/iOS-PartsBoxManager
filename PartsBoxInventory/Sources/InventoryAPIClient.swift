import Foundation

struct InventoryAPIClient {
    enum ClientError: LocalizedError {
        case invalidBaseURL
        case invalidResponse
        case unauthorized(message: String?)
        case httpStatus(code: Int, message: String?)
        case requestBodyEncodingFailed

        var errorDescription: String? {
            switch self {
            case .invalidBaseURL:
                return "Invalid base URL"
            case .invalidResponse:
                return "Invalid response"
            case let .unauthorized(message):
                if let message, !message.isEmpty {
                    return message
                }
                return "Authentication required. Please log in again."
            case let .httpStatus(code, message):
                if let message, !message.isEmpty {
                    return "Server returned \(code): \(message)"
                }
                return "Server returned \(code)"
            case .requestBodyEncodingFailed:
                return "Could not encode request body"
            }
        }

        var isUnauthorized: Bool {
            if case .unauthorized = self {
                return true
            }
            return false
        }
    }

    let baseURL: URL
    let token: String?
    let session: URLSession

    init(baseURL: URL, token: String? = nil, session: URLSession? = nil) {
        self.baseURL = baseURL
        self.token = token
        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 8.0
            config.timeoutIntervalForResource = 15.0
            config.waitsForConnectivity = false
            self.session = URLSession(configuration: config)
        }
    }

    func fetchAuthStatus() async throws -> MobileAuthStatusResponse {
        try await request("api/auth/status")
    }

    func login(password: String) async throws -> MobileAuthLoginResponse {
        try await request(
            "api/auth/login",
            body: MobileAuthLoginRequest(password: password),
            includeAuthorization: false
        )
    }

    func fetchSections() async throws -> MobileSectionsResponse {
        try await request("api/mobile/sections")
    }

    func fetchParts(section: InventorySection) async throws -> MobilePartsResponse {
        try await request(
            "api/mobile/parts",
            queryItems: [URLQueryItem(name: "section", value: section.rawValue)]
        )
    }

    func fetchPart(id: String) async throws -> MobilePartDetailDTO {
        try await request("api/mobile/part/\(id)")
    }

    func fetchStorage() async throws -> MobileStorageResponse {
        try await request("api/mobile/storage")
    }

    func createStorage(name: String) async throws -> MobileCreateStorageResponse {
        try await request("api/mobile/storage", body: MobileCreateStorageRequest(name: name))
    }

    func deleteStorage(id: String) async throws -> MobileDeleteStorageResponse {
        try await request("api/mobile/storage/\(id)", method: "DELETE")
    }

    func fetchUncategorized() async throws -> MobileUncategorizedPartsResponse {
        try await request("api/mobile/uncategorized")
    }

    func adjustStock(
        partID: String,
        storageID: String,
        delta: Int,
        note: String? = nil
    ) async throws -> MobileStockAdjustResponse {
        try await request(
            "api/mobile/part/\(partID)/stock-adjust",
            body: MobileStockAdjustRequest(storageId: storageID, delta: delta, note: note)
        )
    }

    func updateCategory(partID: String, category: InventoryCategoryTaxonomy, tag: String? = nil) async throws -> MobileCategoryUpdateResponse {
        try await request(
            "api/mobile/part/\(partID)/category",
            body: MobileCategoryUpdateRequest(category: category.rawValue, tag: tag)
        )
    }

    func deletePart(partID: String) async throws -> MobileDeletePartResponse {
        try await request("api/mobile/part/\(partID)", method: "DELETE")
    }

    func pullDetails(partID: String) async throws -> MobilePullDetailsResponse {
        try await request("api/mobile/part/\(partID)/pull-details", body: EmptyRequest())
    }

    func fetchLabelImage(partID: String, paperSize: LabelPaperSize = .mm30x15) async throws -> Data {
        try await requestData(
            "api/mobile/part/\(partID)/label.png",
            queryItems: [URLQueryItem(name: "paper", value: paperSize.rawValue)]
        )
    }

    func fetchPartsForStorage(storageID: String) async throws -> MobileStoragePartsResponse {
        try await request("api/mobile/storage/\(storageID)/parts", method: "GET")
    }

    func fetchStorageLabelImage(storageID: String, text: String, paperSize: LabelPaperSize = .mm30x15) async throws -> Data {
        try await requestData(
            "api/mobile/storage/\(storageID)/label.png",
            queryItems: [
                URLQueryItem(name: "paper", value: paperSize.rawValue),
                URLQueryItem(name: "text", value: text)
            ]
        )
    }

    func sync() async throws -> MobileSyncResponse {
        try await request("api/sync", body: EmptyRequest())
    }

    func fetchHistory() async throws -> MobileHistoryResponse {
        try await request("api/mobile/history")
    }

    func parseScan(raw: String) async throws -> MobileScanParseResponse {
        try await request("api/mobile/scan/parse", body: MobileScanParseRequest(raw: raw))
    }

    func enrichScan(raw: String) async throws -> MobileScanEnrichResponse {
        try await request("api/mobile/scan/enrich", body: MobileScanParseRequest(raw: raw))
    }

    func confirmScan(_ request: MobileScanConfirmRequest) async throws -> MobileScanConfirmResponse {
        try await self.request("api/mobile/scan/confirm", body: request)
    }

    func resolveScan(raw: String) async throws -> MobileScanResolveResponse {
        try await request("api/mobile/scan/resolve", body: MobileScanResolveRequest(raw: raw))
    }

    private func request<Response: Decodable>(
        _ path: String,
        queryItems: [URLQueryItem] = [],
        method: String = "GET",
        includeAuthorization: Bool = true
    ) async throws -> Response {
        let url = try makeURL(path: path, queryItems: queryItems)
        var request = URLRequest(url: url)
        request.httpMethod = method
        if includeAuthorization, let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await session.data(for: request)
        try validate(data: data, response: response)
        return try JSONDecoder().decode(Response.self, from: data)
    }

    private func request<Response: Decodable, Body: Encodable>(
        _ path: String,
        body: Body,
        includeAuthorization: Bool = true
    ) async throws -> Response {
        let url = try makeURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if includeAuthorization, let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            throw ClientError.requestBodyEncodingFailed
        }
        let (data, response) = try await session.data(for: request)
        try validate(data: data, response: response)
        return try JSONDecoder().decode(Response.self, from: data)
    }

    /// Fetches raw bytes (e.g. an image) without JSON decoding.
    private func requestData(
        _ path: String,
        queryItems: [URLQueryItem] = [],
        method: String = "GET",
        includeAuthorization: Bool = true
    ) async throws -> Data {
        let url = try makeURL(path: path, queryItems: queryItems)
        var request = URLRequest(url: url)
        request.httpMethod = method
        if includeAuthorization, let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await session.data(for: request)
        try validate(data: data, response: response)
        return data
    }

    private func makeURL(path: String, queryItems: [URLQueryItem] = []) throws -> URL {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw ClientError.invalidBaseURL
        }

        let cleanPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let basePath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        switch (basePath.isEmpty, cleanPath.isEmpty) {
        case (true, true):
            components.path = "/"
        case (true, false):
            components.path = "/" + cleanPath
        case (false, true):
            components.path = "/" + basePath
        case (false, false):
            components.path = "/" + basePath + "/" + cleanPath
        }

        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            throw ClientError.invalidBaseURL
        }
        return url
    }

    private func validate(data: Data, response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.invalidResponse
        }

        guard (200...299).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8)
            if http.statusCode == 401 {
                throw ClientError.unauthorized(message: message)
            }
            throw ClientError.httpStatus(code: http.statusCode, message: message)
        }
    }
}

private struct EmptyRequest: Encodable {}
