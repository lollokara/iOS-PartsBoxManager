import Combine
import SwiftUI
import Vision
import VisionKit

@MainActor
final class SectionInventoryViewModel: ObservableObject {
    @Published var rows: [MobilePartRowDTO] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    func load(section: InventorySection, settings: SettingsStore) async {
        guard let initialClient = settings.apiClient else {
            errorMessage = "Set a base URL in Manage."
            if rows.isEmpty {
                rows = []
            }
            return
        }

        guard !settings.requiresLogin else {
            errorMessage = "Authentication required. Log in from Manage."
            if rows.isEmpty {
                rows = []
            }
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await fetchPartsWithOneRetry(section: section, initialClient: initialClient, settings: settings)
            rows = response.parts
            errorMessage = nil
        } catch is CancellationError {
            // Ignore task cancellation
        } catch let urlError as URLError where urlError.code == .cancelled {
            // Ignore URL request cancellation
        } catch {
            if rows.isEmpty {
                rows = []
            }
            errorMessage = settings.handleAPIError(error)
        }
    }

    private func fetchPartsWithOneRetry(
        section: InventorySection,
        initialClient: InventoryAPIClient,
        settings: SettingsStore
    ) async throws -> MobilePartsResponse {
        do {
            return try await initialClient.fetchParts(section: section)
        } catch {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard let retryClient = settings.apiClient, !settings.requiresLogin else {
                throw error
            }
            do {
                return try await retryClient.fetchParts(section: section)
            } catch {
                throw error
            }
        }
    }
}

struct InventoryHomeView: View {
    let openManage: () -> Void
    let openPart: (String) -> Void
    let openStorage: (String, String) -> Void

    @EnvironmentObject private var settingsStore: SettingsStore
    @StateObject private var viewModel = SectionInventoryViewModel()
    @State private var section: InventorySection = .active
    @State private var searchText = ""
    @State private var isScannerPresented = false
    @State private var scannerMessage: String?
    @State private var scannerDraft: InventoryScanDraft?
    @State private var isResolvingScan = false
    @State private var selectedTag: String?

    private let sections = InventorySection.allCases.filter(\.isInventoryTab)

    private var filteredRows: [MobilePartRowDTO] {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return viewModel.rows
        }

        let needle = trimmed.lowercased()
        return tagFilteredRows.filter { row in
            row.pn.lowercased().contains(needle)
                || row.description.lowercased().contains(needle)
                || (row.value?.lowercased().contains(needle) ?? false)
                || String(row.quantity).contains(needle)
                || row.displayTags.contains { $0.lowercased().contains(needle) }
        }
    }

    private var tagFilteredRows: [MobilePartRowDTO] {
        guard let selectedTag else {
            return viewModel.rows
        }
        return viewModel.rows.filter { $0.displayTags.contains(selectedTag) }
    }

    private var availableTags: [String] {
        Array(Set(viewModel.rows.flatMap(\.displayTags))).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    Text(section.title)
                        .font(.largeTitle.weight(.bold))
                        .lineLimit(1)

                    Spacer()

                    Button {
                        scannerMessage = nil
                        isScannerPresented = true
                    } label: {
                        Image(systemName: "camera.viewfinder")
                            .font(.title2.weight(.semibold))
                            .frame(width: 48, height: 48)
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.circle)
                    .disabled(isResolvingScan)

                    Button {
                        Task {
                            await viewModel.load(section: section, settings: settingsStore)
                        }
                    } label: {
                        Image(systemName: viewModel.isLoading ? "hourglass" : "arrow.clockwise")
                            .font(.title2.weight(.semibold))
                            .frame(width: 48, height: 48)
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.circle)
                    .disabled(viewModel.isLoading)
                }

                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                    TextField("Search", text: $searchText)
                        .font(.title3)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.search)
                }
                .padding(.horizontal, 16)
                .frame(height: 54)
                .background(.regularMaterial, in: Capsule())

                Menu {
                    ForEach(sections) { candidate in
                        Button {
                            section = candidate
                        } label: {
                            Label(candidate.title, systemImage: candidate.systemImage)
                        }
                    }
                } label: {
                    HStack(spacing: 12) {
                        Text("Category")
                            .font(.headline)
                            .foregroundStyle(.primary)
                        Spacer(minLength: 12)
                        Label(section.title, systemImage: section.systemImage)
                            .font(.headline)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.subheadline.weight(.semibold))
                    }
                    .padding(.horizontal, 16)
                    .frame(height: 54)
                    .background(.regularMaterial, in: Capsule())
                }

                if !availableTags.isEmpty {
                    TagShortcutBar(tags: availableTags, selectedTag: $selectedTag)
                }

                if settingsStore.resolvedBaseURL == nil {
                    InventoryStatusCard(
                        title: "Connect in Manage",
                        message: "Set a URL or use server discovery.",
                        systemImage: "network",
                        buttonTitle: "Open Manage",
                        action: openManage
                    )
                } else if let errorMessage = viewModel.errorMessage {
                    InventoryStatusCard(
                        title: "Could not load \(section.title)",
                        message: errorMessage,
                        systemImage: "exclamationmark.triangle",
                        buttonTitle: nil,
                        action: nil
                    )
                    .textSelection(.enabled)
                } else if filteredRows.isEmpty {
                    if let scannerMessage {
                        InventoryStatusCard(
                            title: "Scanner",
                            message: scannerMessage,
                            systemImage: "camera.viewfinder",
                            buttonTitle: nil,
                            action: nil
                        )
                    }

                    InventoryStatusCard(
                        title: "No \(section.title.lowercased())",
                        message: viewModel.isLoading ? "Loading..." : "Nothing indexed for this section yet.",
                        systemImage: "tray",
                        buttonTitle: nil,
                        action: nil
                    )
                } else {
                    ForEach(filteredRows) { row in
                        Button {
                            openPart(row.id)
                        } label: {
                            InventoryPartRowView(row: row)
                                .padding(16)
                                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 96)
        }
        .background(Color(.systemBackground))
        .toolbar(.hidden, for: .navigationBar)
        .refreshable {
            await viewModel.load(section: section, settings: settingsStore)
        }
        .sheet(item: $scannerDraft) { draft in
            InventoryScanCreateSheet(
                draft: draft,
                availableTags: availableTags,
                settingsStore: settingsStore,
                onCancel: {
                    scannerDraft = nil
                },
                onCreated: { partID in
                    scannerDraft = nil
                    openPart(partID)
                }
            )
        }
        .fullScreenCover(isPresented: $isScannerPresented) {
            InventoryScannerSheet(
                isWorking: isResolvingScan,
                onCancel: {
                    isScannerPresented = false
                },
                onDetected: { raw in
                    Task {
                        await handleScannedPayload(raw)
                    }
                },
                onError: { message in
                    scannerMessage = message
                    isScannerPresented = false
                }
            )
        }
        .task(id: "\(settingsStore.resolvedBaseURL?.absoluteString ?? "nil")-\(section.rawValue)-\(settingsStore.authRevision)") {
            await viewModel.load(section: section, settings: settingsStore)
        }
        .onChange(of: section) { _, _ in
            selectedTag = nil
        }
    }

    private func handleScannedPayload(_ raw: String) async {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            scannerMessage = "Scanner returned an empty payload."
            return
        }

        // 1. Try to parse as partsbox.com URLs first (either storage or parts)
        if let url = URL(string: trimmed), url.host == "partsbox.com" {
            let segments = url.pathComponents.filter { $0 != "/" }
            if let storageIndex = segments.firstIndex(of: "storage"), storageIndex < segments.count - 1 {
                let storageID = segments[storageIndex + 1]
                if storageID.count == 26, storageID.allSatisfy({ $0.isLowercase || $0.isNumber }) {
                    await resolveStorageNavigation(storageID: storageID)
                    return
                }
            }
            if let partsIndex = segments.firstIndex(of: "parts"), partsIndex < segments.count - 1 {
                let partID = segments[partsIndex + 1]
                if partID.count == 26, partID.allSatisfy({ $0.isLowercase || $0.isNumber }) {
                    scannerMessage = nil
                    isScannerPresented = false
                    openPart(partID)
                    return
                }
            }
        }

        // 2. Check if it's a raw 26-character lowercase/alphanumeric string
        if trimmed.count == 26, trimmed.allSatisfy({ $0.isLowercase || $0.isNumber }) {
            guard let client = settingsStore.apiClient else {
                scannerMessage = "Set a base URL in Manage."
                return
            }
            guard !settingsStore.requiresLogin else {
                scannerMessage = "Authentication required. Log in from Manage."
                return
            }
            isResolvingScan = true
            defer { isResolvingScan = false }

            do {
                let response = try await client.fetchStorage()
                if let matchedStorage = response.storage.first(where: { $0.id == trimmed }) {
                    scannerMessage = nil
                    isScannerPresented = false
                    openStorage(matchedStorage.id, matchedStorage.displayName)
                    return
                }
            } catch {
                // If lookup fails, ignore and proceed to treat as part ID
            }

            scannerMessage = nil
            isScannerPresented = false
            openPart(trimmed)
            return
        }

        guard let client = settingsStore.apiClient else {
            scannerMessage = "Set a base URL in Manage."
            return
        }

        guard !settingsStore.requiresLogin else {
            scannerMessage = "Authentication required. Log in from Manage."
            return
        }

        isResolvingScan = true
        defer { isResolvingScan = false }

        do {
            let resolved = try await client.resolveScan(raw: trimmed)
            if let partID = resolved.part?.id {
                scannerMessage = nil
                isScannerPresented = false
                openPart(partID)
                return
            }

            let parsed: MobileParsedScanLabelDTO
            if let resolvedParsed = resolved.parsed {
                parsed = resolvedParsed
            } else {
                parsed = try await client.parseScan(raw: trimmed).parsed
            }
            scannerDraft = InventoryScanDraft(raw: trimmed, parsed: parsed)
            scannerMessage = nil
            isScannerPresented = false
        } catch {
            do {
                let parsed = try await client.parseScan(raw: trimmed).parsed
                scannerDraft = InventoryScanDraft(raw: trimmed, parsed: parsed)
                scannerMessage = nil
                isScannerPresented = false
            } catch {
                scannerMessage = settingsStore.handleAPIError(error)
                isScannerPresented = false
            }
        }
    }

    private func resolveStorageNavigation(storageID: String) async {
        guard let client = settingsStore.apiClient else {
            scannerMessage = "Set a base URL in Manage."
            return
        }
        guard !settingsStore.requiresLogin else {
            scannerMessage = "Authentication required. Log in from Manage."
            return
        }
        isResolvingScan = true
        defer { isResolvingScan = false }

        do {
            let response = try await client.fetchStorage()
            let name = response.storage.first(where: { $0.id == storageID })?.displayName ?? storageID
            scannerMessage = nil
            isScannerPresented = false
            openStorage(storageID, name)
        } catch {
            scannerMessage = settingsStore.handleAPIError(error)
            isScannerPresented = false
        }
    }
}

private struct InventoryStatusCard: View {
    let title: String
    let message: String
    let systemImage: String
    let buttonTitle: String?
    let action: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label {
                Text(title)
                    .font(.headline)
            } icon: {
                Image(systemName: systemImage)
                    .foregroundStyle(.blue)
            }

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let buttonTitle, let action {
                Button(buttonTitle, action: action)
                    .buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct InventorySectionView: View {
    let section: InventorySection

    @EnvironmentObject private var settingsStore: SettingsStore
    @StateObject private var viewModel = SectionInventoryViewModel()
    @State private var searchText = ""
    @State private var selectedTag: String?

    private var filteredRows: [MobilePartRowDTO] {
        guard !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return tagFilteredRows
        }

        let needle = searchText.lowercased()
        return tagFilteredRows.filter { row in
            row.pn.lowercased().contains(needle)
                || row.description.lowercased().contains(needle)
                || (row.value?.lowercased().contains(needle) ?? false)
                || String(row.quantity).contains(needle)
                || row.displayTags.contains { $0.lowercased().contains(needle) }
        }
    }

    private var tagFilteredRows: [MobilePartRowDTO] {
        guard let selectedTag else {
            return viewModel.rows
        }
        return viewModel.rows.filter { $0.displayTags.contains(selectedTag) }
    }

    private var availableTags: [String] {
        Array(Set(viewModel.rows.flatMap(\.displayTags))).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.rows.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    if !availableTags.isEmpty {
                        Section {
                            TagShortcutBar(tags: availableTags, selectedTag: $selectedTag)
                                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                        }
                    }

                    if let errorMessage = viewModel.errorMessage {
                        Section {
                            Text(errorMessage)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if filteredRows.isEmpty {
                        Section {
                            ContentUnavailableView(
                                viewModel.isLoading ? "Loading \(section.title.lowercased())" : "No parts",
                                systemImage: viewModel.isLoading ? "hourglass" : "tray"
                            )
                                .frame(maxWidth: .infinity)
                        }
                    } else {
                        ForEach(filteredRows) { row in
                            NavigationLink {
                                PartDetailView(partID: row.id)
                            } label: {
                                InventoryPartRowView(row: row)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle(section.title)
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task {
                        await viewModel.load(section: section, settings: settingsStore)
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .refreshable {
            await viewModel.load(section: section, settings: settingsStore)
        }
        .task(id: "\(settingsStore.resolvedBaseURL?.absoluteString ?? "nil")-\(section.rawValue)-\(settingsStore.authRevision)") {
            await viewModel.load(section: section, settings: settingsStore)
        }
    }
}

private struct InventoryPartRowView: View {
    let row: MobilePartRowDTO

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(row.pn)
                        .font(.headline)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .layoutPriority(1)
                    if row.category != nil || row.categoryLabel != nil {
                        CategoryTag(category: row.category, categoryLabel: row.categoryLabel)
                            .layoutPriority(0)
                    }
                    SyncStateTag(status: row.syncStatus)
                        .layoutPriority(0)
                }

                if let value = row.value, !value.isEmpty {
                    Text(value)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                if !row.displayTags.isEmpty {
                    TagWrap(tags: Array(row.displayTags.prefix(3)))
                }

                Text(row.description.isEmpty ? "No description" : row.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 2) {
                Text(row.quantity.formatted())
                    .font(.headline)
                    .monospacedDigit()
                Text("pcs")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if let price = row.price {
                    let currencySymbol = row.currency?.uppercased() ?? "USD"
                    Text(String(format: "%.4f %@", price, currencySymbol))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.top, 2)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

private struct CategoryTag: View {
    let category: String?
    let categoryLabel: String?

    var body: some View {
        Text(displayText)
            .font(.caption2.weight(.semibold))
            .lineLimit(1)
            .truncationMode(.tail)
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tint.gradient, in: Capsule())
            .overlay(
                Capsule()
                    .strokeBorder(.white.opacity(0.18), lineWidth: 1)
            )
    }

    private var tint: Color {
        if let category, let taxonomy = InventoryCategoryTaxonomy(rawValue: category) {
            return taxonomy.tint
        }
        return .secondary
    }

    private var displayText: String {
        if let categoryLabel, !categoryLabel.isEmpty {
            return abbreviatedLabel(categoryLabel)
        }
        if let category,
           let taxonomy = InventoryCategoryTaxonomy(rawValue: category) {
            return abbreviatedLabel(taxonomy.label)
        }
        return category ?? "Uncategorized"
    }

    /// Returns a shorter version of the category label for display in the compact badge.
    private func abbreviatedLabel(_ label: String) -> String {
        switch label {
        case "Crystal/Oscillator": return "Xtal/Osc"
        case "Switch/Button":       return "Switch"
        case "Tool/Consumable":     return "Consumable"
        case "Diode/LED":           return "Diode/LED"
        case "Uncategorized":       return "Unknown"
        default: return label
        }
    }
}

private struct SyncStateTag: View {
    let status: String?

    var body: some View {
        if let status, status == "pending" || status == "syncing" || status == "failed" {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(status == "failed" ? .white : .primary)
                .lineLimit(1)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(tint, in: Capsule())
        }
    }

    private var label: String {
        switch status {
        case "syncing":
            return "Syncing"
        case "failed":
            return "Local Failed"
        default:
            return "Local"
        }
    }

    private var tint: Color {
        switch status {
        case "failed":
            return .red
        case "syncing":
            return .blue.opacity(0.22)
        default:
            return .yellow.opacity(0.32)
        }
    }
}

private struct TagShortcutBar: View {
    let tags: [String]
    @Binding var selectedTag: String?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if selectedTag != nil {
                    Button {
                        selectedTag = nil
                    } label: {
                        Label("All", systemImage: "line.3.horizontal.decrease.circle")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                ForEach(tags, id: \.self) { tag in
                    Button {
                        selectedTag = selectedTag == tag ? nil : tag
                    } label: {
                        Text(tagDisplayName(tag))
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .tint(selectedTag == tag ? .blue : .secondary)
                }
            }
            .padding(.vertical, 2)
        }
    }
}

private struct TagWrap: View {
    let tags: [String]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(tags, id: \.self) { tag in
                Text(tagDisplayName(tag))
                    .font(.caption2.weight(.medium))
                    .lineLimit(1)
                    .foregroundStyle(.primary)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.18), in: Capsule())
            }
        }
    }
}

private struct InventoryScanDraft: Identifiable {
    let raw: String
    let parsed: MobileParsedScanLabelDTO

    var id: String { raw }
}

private struct InventoryScannerSheet: View {
    let isWorking: Bool
    let onCancel: () -> Void
    let onDetected: (String) -> Void
    let onError: (String) -> Void

    var body: some View {
        ZStack(alignment: .top) {
            if DataScannerViewController.isSupported {
                InventoryScannerCameraView(
                    onDetected: onDetected,
                    onError: onError
                )
                .ignoresSafeArea()
            } else {
                ContentUnavailableView(
                    "Scanner unavailable",
                    systemImage: "camera.viewfinder",
                    description: Text("This device does not support live barcode scanning.")
                )
                .padding()
            }

            HStack(spacing: 12) {
                Button(action: onCancel) {
                    Image(systemName: "xmark")
                        .font(.headline.weight(.semibold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.circle)

                Spacer()

                VStack(spacing: 2) {
                    Text("Scan")
                        .font(.headline)
                    Text("QR, Data Matrix, Code 128")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if isWorking {
                    ProgressView()
                        .frame(width: 44, height: 44)
                } else {
                    Color.clear
                        .frame(width: 44, height: 44)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
        .background(Color.black)
    }
}

private struct InventoryScannerCameraView: UIViewControllerRepresentable {
    let onDetected: (String) -> Void
    let onError: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onDetected: onDetected, onError: onError)
    }

    func makeUIViewController(context: Context) -> UIViewController {
        guard DataScannerViewController.isSupported else {
            return UIViewController()
        }

        let recognizedDataTypes: Set<DataScannerViewController.RecognizedDataType> = [
            .barcode(symbologies: [.qr, .dataMatrix, .code128])
        ]

        let scanner = DataScannerViewController(
            recognizedDataTypes: recognizedDataTypes,
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: true,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )

        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        guard let scanner = uiViewController as? DataScannerViewController else {
            return
        }
        context.coordinator.startIfNeeded(scanner)
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onDetected: (String) -> Void
        private let onError: (String) -> Void
        private var didStart = false
        private var didEmit = false

        init(onDetected: @escaping (String) -> Void, onError: @escaping (String) -> Void) {
            self.onDetected = onDetected
            self.onError = onError
        }

        func startIfNeeded(_ scanner: DataScannerViewController) {
            guard !didStart else {
                return
            }
            didStart = true
            do {
                try scanner.startScanning()
            } catch {
                onError(error.localizedDescription)
            }
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
            handle(item: item, scanner: dataScanner)
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard let item = addedItems.first else {
                return
            }
            handle(item: item, scanner: dataScanner)
        }

        private func handle(item: RecognizedItem, scanner: DataScannerViewController) {
            guard !didEmit else {
                return
            }

            let payload: String?
            switch item {
            case .barcode(let barcode):
                payload = barcode.payloadStringValue
            case .text(let text):
                payload = text.transcript
            @unknown default:
                payload = nil
            }

            guard let payload, !payload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return
            }

            didEmit = true
            scanner.stopScanning()
            onDetected(payload)
        }
    }
}

private struct InventoryScanCreateSheet: View {
    let draft: InventoryScanDraft
    let availableTags: [String]
    let settingsStore: SettingsStore
    let onCancel: () -> Void
    let onCreated: (String) -> Void

    @State private var name: String
    @State private var description: String
    @State private var selectedCategory: InventoryCategoryTaxonomy
    @State private var selectedStorageID: String = ""
    @State private var quantity: Int
    @State private var storageOptions: [MobileStorageDTO] = []
    @State private var statusMessage: String?
    @State private var isWorking = false
    @State private var isPresentingNewLocation = false
    @State private var newLocationName = ""

    @State private var fetchedValue: String = ""
    @State private var fetchedTolerance: String = ""
    @State private var fetchedVoltage: String = ""
    @State private var fetchedPackage: String = ""
    @State private var fetchedManufacturer: String = ""
    @State private var fetchedDatasheetUrl: String = ""

    init(
        draft: InventoryScanDraft,
        availableTags: [String],
        settingsStore: SettingsStore,
        onCancel: @escaping () -> Void,
        onCreated: @escaping (String) -> Void
    ) {
        self.draft = draft
        self.availableTags = availableTags
        self.settingsStore = settingsStore
        self.onCancel = onCancel
        self.onCreated = onCreated

        let parsed = draft.parsed
        _name = State(initialValue: parsed.manufacturerPartNumber ?? parsed.supplierPartNumber ?? draft.raw)
        _description = State(initialValue: scanDescription(for: parsed))
        _selectedCategory = State(initialValue: .uncategorized)
        _quantity = State(initialValue: parsed.quantity ?? 1)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Scan") {
                    LabeledContent("Vendor", value: draft.parsed.vendor)
                    LabeledContent("Supplier PN", value: draft.parsed.supplierPartNumber ?? "—")
                    LabeledContent("MPN", value: draft.parsed.manufacturerPartNumber ?? "—")
                    LabeledContent("Confidence", value: draft.parsed.confidence.formatted(.number.precision(.fractionLength(2))))
                }

                Section("Create") {
                    TextField("Name", text: $name)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(2...4)

                    LabeledContent("Category", value: selectedCategory.sectionLabel)

                    Picker("Tag", selection: $selectedCategory) {
                        ForEach(InventoryCategoryTaxonomy.allCases) { category in
                            Text(category.label).tag(category)
                        }
                    }
                    .pickerStyle(.menu)

                    if selectedCategory != .uncategorized || !fetchedValue.isEmpty || !fetchedTolerance.isEmpty || !fetchedManufacturer.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("PREVIEW / DETECTED INFO")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.secondary)
                                .padding(.top, 4)
                            LabeledContent("Category", value: selectedCategory.label)
                            if !fetchedManufacturer.isEmpty {
                                LabeledContent("Manufacturer", value: fetchedManufacturer)
                            }
                            if !fetchedValue.isEmpty {
                                LabeledContent("Value", value: fetchedValue)
                            }
                            if !fetchedTolerance.isEmpty {
                                LabeledContent("Tolerance", value: fetchedTolerance)
                            }
                            if !fetchedVoltage.isEmpty {
                                LabeledContent("Voltage", value: fetchedVoltage)
                            }
                            if !fetchedPackage.isEmpty {
                                LabeledContent("Package", value: fetchedPackage)
                            }
                            if !fetchedDatasheetUrl.isEmpty {
                                LabeledContent("Datasheet", value: "Available")
                            }
                        }
                        .padding(.vertical, 4)
                    }

                    Picker("Storage", selection: $selectedStorageID) {
                        Text("Choose storage").tag("")
                        ForEach(storageOptions) { storage in
                            Text(storage.displayName).tag(storage.id)
                        }
                    }
                    .pickerStyle(.menu)

                    Button {
                        newLocationName = ""
                        isPresentingNewLocation = true
                    } label: {
                        Label("New location…", systemImage: "plus")
                    }
                    .buttonStyle(.borderless)
                    .disabled(isWorking)

                    Stepper("Quantity \(quantity)", value: $quantity, in: 1...100_000)

                    Button {
                        Task {
                            await createPart()
                        }
                    } label: {
                        Label(isWorking ? "Creating…" : "Create Part", systemImage: "plus.circle.fill")
                    }
                    .disabled(isWorking || selectedStorageID.isEmpty || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                if let statusMessage {
                    Section {
                        Text(statusMessage)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }
            }
            .navigationTitle("Add Stock")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel", action: onCancel)
                }
            }
            .task(id: "\(settingsStore.resolvedBaseURL?.absoluteString ?? "nil")-\(settingsStore.authRevision)") {
                await loadStorage()
            }
            .task {
                await enrich()
            }
            .alert("New storage location", isPresented: $isPresentingNewLocation) {
                TextField("Location name", text: $newLocationName)
                Button("Cancel", role: .cancel) {
                    newLocationName = ""
                }
                Button("Create") {
                    Task {
                        await createStorageLocation(name: newLocationName)
                        newLocationName = ""
                    }
                }
            } message: {
                Text("Create a new storage location in PartsBox.")
            }
        }
    }

    private func createStorageLocation(name: String) async {
        guard let client = settingsStore.apiClient else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        
        isWorking = true
        statusMessage = nil
        defer { isWorking = false }
        
        do {
            let response = try await client.createStorage(name: trimmed)
            let dto = MobileStorageDTO(id: response.id, name: response.name, label: response.label)
            if !storageOptions.contains(where: { $0.id == dto.id }) {
                storageOptions.append(dto)
            }
            selectedStorageID = dto.id
            settingsStore.rememberLastStorage(dto.id)
        } catch {
            statusMessage = settingsStore.handleAPIError(error)
        }
    }

    private func loadStorage() async {
        guard let client = settingsStore.apiClient else {
            statusMessage = "Set a base URL in Manage."
            return
        }

        guard !settingsStore.requiresLogin else {
            statusMessage = "Authentication required. Log in from Manage."
            return
        }

        do {
            let response = try await client.fetchStorage()
            storageOptions = response.storage
            if selectedStorageID.isEmpty {
                selectedStorageID = response.storage.first { $0.id == settingsStore.settings.lastStorageID }?.id
                    ?? response.storage.first?.id
                    ?? ""
            }
        } catch {
            statusMessage = settingsStore.handleAPIError(error)
        }
    }

    private func enrich() async {
        guard let client = settingsStore.apiClient, !settingsStore.requiresLogin else {
            return
        }
        do {
            let result = try await client.enrichScan(raw: draft.raw)
            if let resolvedName = result.name, !resolvedName.isEmpty {
                name = resolvedName
            }
            if let resolvedDescription = result.description, !resolvedDescription.isEmpty {
                description = resolvedDescription
            }
            if let rawCategory = result.category, let category = InventoryCategoryTaxonomy(rawValue: rawCategory) {
                selectedCategory = category
            }
            fetchedValue = result.value ?? ""
            fetchedTolerance = result.tolerance ?? ""
            fetchedVoltage = result.voltage ?? ""
            fetchedPackage = result.package ?? ""
            fetchedManufacturer = result.manufacturer ?? ""
            fetchedDatasheetUrl = result.datasheetUrl ?? ""
        } catch {
            // Best-effort enrichment; keep the parsed defaults on failure.
        }
    }

    private func createPart() async {
        guard let client = settingsStore.apiClient else {
            statusMessage = "Set a base URL in Manage."
            return
        }

        guard !settingsStore.requiresLogin else {
            statusMessage = "Authentication required. Log in from Manage."
            return
        }

        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !selectedStorageID.isEmpty else {
            statusMessage = "Choose a storage location."
            return
        }

        isWorking = true
        defer { isWorking = false }

        do {
            let response = try await client.confirmScan(
                MobileScanConfirmRequest(
                    raw: draft.raw,
                    storageId: selectedStorageID,
                    name: trimmedName.isEmpty ? nil : trimmedName,
                    description: trimmedDescription.isEmpty ? nil : trimmedDescription,
                    category: selectedCategory == .uncategorized ? nil : selectedCategory.rawValue,
                    tag: nil,
                    quantity: quantity,
                    value: fetchedValue.isEmpty ? nil : fetchedValue,
                    tolerance: fetchedTolerance.isEmpty ? nil : fetchedTolerance,
                    voltage: fetchedVoltage.isEmpty ? nil : fetchedVoltage,
                    package: fetchedPackage.isEmpty ? nil : fetchedPackage,
                    manufacturer: fetchedManufacturer.isEmpty ? nil : fetchedManufacturer,
                    datasheetUrl: fetchedDatasheetUrl.isEmpty ? nil : fetchedDatasheetUrl
                )
            )
            settingsStore.rememberLastStorage(selectedStorageID)
            onCreated(response.partId)
        } catch {
            statusMessage = settingsStore.handleAPIError(error)
        }
    }
}

private func extractPartID(from raw: String) -> String? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.count == 26, trimmed.allSatisfy({ $0.isLowercase || $0.isNumber }) {
        return trimmed
    }

    guard let url = URL(string: trimmed), url.host == "partsbox.com" else {
        return nil
    }

    let segments = url.pathComponents.filter { $0 != "/" }
    guard let partsIndex = segments.firstIndex(of: "parts"), partsIndex < segments.count - 1 else {
        return nil
    }

    let candidate = segments[partsIndex + 1]
    guard candidate.count == 26, candidate.allSatisfy({ $0.isLowercase || $0.isNumber }) else {
        return nil
    }
    return candidate
}

private func scanDescription(for parsed: MobileParsedScanLabelDTO) -> String {
    let pieces: [String] = [
        parsed.manufacturerPartNumber.map { "MPN: \($0)" },
        parsed.supplierPartNumber.map { "Supplier PN: \($0)" },
        parsed.lotCode.map { "Lot: \($0)" },
        parsed.dateCode.map { "Date Code: \($0)" }
    ]
    .compactMap { $0 }

    return pieces.joined(separator: "; ")
}

private func tagDisplayName(_ tag: String) -> String {
    tag
        .replacingOccurrences(of: "pbm-category-", with: "")
        .replacingOccurrences(of: "-", with: " ")
        .replacingOccurrences(of: "_", with: " ")
}
