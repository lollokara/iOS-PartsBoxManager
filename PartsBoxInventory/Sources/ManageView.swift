import Combine
import SwiftUI

@MainActor
final class ManageViewModel: ObservableObject {
    @Published var scannerEntry = ""
    @Published var scannedName = ""
    @Published var scannedDescription = ""
    @Published var selectedStorageID = ""
    @Published var createCategory: InventoryCategoryTaxonomy? = nil
    @Published var scannedQuantity = 1
    @Published var parsedScan: MobileParsedScanLabelDTO?
    @Published var storageOptions: [MobileStorageDTO] = []
    @Published var uncategorizedParts: [MobilePartRowDTO] = []
    @Published var selectedPartID = ""
    @Published var selectedCategory: InventoryCategoryTaxonomy = .ic
    @Published var statusMessage: String?
    @Published var isWorking = false
    @Published var totalStockValue: Double = 0.0
    @Published var fetchedValue = ""
    @Published var fetchedTolerance = ""
    @Published var fetchedVoltage = ""
    @Published var fetchedPackage = ""
    @Published var fetchedManufacturer = ""
    @Published var fetchedDatasheetUrl = ""
    @Published var showingExistingPartAlert = false
    @Published var existingPartId = ""
    @Published var existingPartPN = ""

    var selectedPart: MobilePartRowDTO? {
        uncategorizedParts.first { $0.id == selectedPartID }
    }

    func loadLookups(settings: SettingsStore) async {
        guard let client = settings.apiClient else {
            storageOptions = []
            uncategorizedParts = []
            if statusMessage == nil {
                statusMessage = "Set a base URL first."
            }
            return
        }

        guard !settings.requiresLogin else {
            storageOptions = []
            uncategorizedParts = []
            statusMessage = "Authentication required. Log in below."
            return
        }

        isWorking = true
        defer { isWorking = false }

        do {
            async let storageTask = client.fetchStorage()
            async let uncategorizedTask = client.fetchUncategorized()
            let (storageResponse, uncategorizedResponse) = try await (storageTask, uncategorizedTask)

            storageOptions = storageResponse.storage
            uncategorizedParts = uncategorizedResponse.parts
            totalStockValue = uncategorizedResponse.totalStockValue ?? 0.0
            statusMessage = nil

            // Cache locally
            settings.cacheStorage(storage: storageResponse.storage)
            settings.cacheUncategorized(parts: uncategorizedResponse.parts)
            settings.setOffline(false)

            if selectedStorageID.isEmpty || !storageOptions.contains(where: { $0.id == selectedStorageID }) {
                selectedStorageID = storageOptions.first { $0.id == settings.settings.lastStorageID }?.id
                    ?? storageOptions.first?.id
                    ?? ""
            }
            if selectedPartID.isEmpty || !uncategorizedParts.contains(where: { $0.id == selectedPartID }) {
                selectedPartID = uncategorizedParts.first?.id ?? ""
            }
        } catch {
            if settings.isNetworkError(error) {
                settings.setOffline(true)
                if let cachedStorage = settings.getCachedStorage(),
                   let cachedUncat = settings.getCachedUncategorized() {
                    storageOptions = cachedStorage
                    uncategorizedParts = cachedUncat
                    totalStockValue = 0.0
                    statusMessage = "Offline Mode: Showing cached data."
                    
                    if selectedStorageID.isEmpty || !storageOptions.contains(where: { $0.id == selectedStorageID }) {
                        selectedStorageID = storageOptions.first { $0.id == settings.settings.lastStorageID }?.id
                            ?? storageOptions.first?.id
                            ?? ""
                    }
                    if selectedPartID.isEmpty || !uncategorizedParts.contains(where: { $0.id == selectedPartID }) {
                        selectedPartID = uncategorizedParts.first?.id ?? ""
                    }
                    return
                }
            }
            statusMessage = settings.handleAPIError(error)
        }
    }

    func syncNow(settings: SettingsStore) async {
        guard let client = settings.apiClient else {
            statusMessage = "Set a base URL first."
            return
        }

        guard !settings.requiresLogin else {
            statusMessage = "Authentication required. Log in below."
            return
        }

        isWorking = true
        defer { isWorking = false }

        do {
            let response = try await client.sync()
            let pendingCount = response.pending?.count ?? 0
            if let failed = response.pending?.first(where: { $0.status == "failed" }), let error = failed.lastError {
                statusMessage = "Sync finished with \(pendingCount) pending. Failed local part: \(error)"
            } else if pendingCount > 0 {
                statusMessage = "Synced \(response.count) parts. \(pendingCount) local change(s) still pending."
            } else {
                statusMessage = "Synced \(response.count) parts. Local and PartsBox are up to date."
            }
        } catch {
            statusMessage = settings.handleAPIError(error)
        }
    }

    func parseScannerEntry(settings: SettingsStore) async {
        guard let client = settings.apiClient else {
            statusMessage = "Set a base URL first."
            return
        }

        guard !settings.requiresLogin else {
            statusMessage = "Authentication required. Log in below."
            return
        }

        isWorking = true
        defer { isWorking = false }

        do {
            let response = try await client.parseScan(raw: scannerEntry)
            parsedScan = response.parsed
            if scannedName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                scannedName = response.parsed.manufacturerPartNumber ?? response.parsed.supplierPartNumber ?? scannedName
            }
            if scannedDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                scannedDescription = scanDescription(for: response.parsed)
            }
            if scannedQuantity == 1, let quantity = response.parsed.quantity {
                scannedQuantity = quantity
            }
            statusMessage = response.parsed.warnings.isEmpty ? "Scan parsed." : response.parsed.warnings.joined(separator: "\n")
        } catch {
            statusMessage = settings.handleAPIError(error)
        }
    }

    func confirmScannerEntry(settings: SettingsStore) async -> String? {
        guard let client = settings.apiClient else {
            statusMessage = "Set a base URL first."
            return nil
        }

        guard !settings.requiresLogin else {
            statusMessage = "Authentication required. Log in below."
            return nil
        }

        let trimmedStorageID = selectedStorageID.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedName = scannedName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedDescription = scannedDescription.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedStorageID.isEmpty else {
            statusMessage = "Choose a storage location."
            return nil
        }

        isWorking = true
        defer { isWorking = false }

        do {
            // Check if part with same PN already exists first
            if let resolveResponse = try? await client.resolveScan(raw: trimmedName), let existingPart = resolveResponse.part {
                existingPartId = existingPart.id
                existingPartPN = existingPart.pn
                showingExistingPartAlert = true
                statusMessage = "Part already exists: \(existingPart.pn)"
                return nil
            }

            let response = try await client.confirmScan(
                MobileScanConfirmRequest(
                    raw: scannerEntry.isEmpty ? trimmedName : scannerEntry,
                    storageId: trimmedStorageID,
                    name: trimmedName.isEmpty ? nil : trimmedName,
                    description: trimmedDescription.isEmpty ? nil : trimmedDescription,
                    category: createCategory?.rawValue,
                    tag: nil,
                    quantity: scannedQuantity,
                    value: fetchedValue.isEmpty ? nil : fetchedValue,
                    tolerance: fetchedTolerance.isEmpty ? nil : fetchedTolerance,
                    voltage: fetchedVoltage.isEmpty ? nil : fetchedVoltage,
                    package: fetchedPackage.isEmpty ? nil : fetchedPackage,
                    manufacturer: fetchedManufacturer.isEmpty ? nil : fetchedManufacturer,
                    datasheetUrl: fetchedDatasheetUrl.isEmpty ? nil : fetchedDatasheetUrl
                )
            )
            settings.rememberLastStorage(trimmedStorageID)
            statusMessage = "Created \(response.partId). Queued for PartsBox sync."
            
            // Clear fields on successful creation
            scannedName = ""
            scannedDescription = ""
            scannerEntry = ""
            scannedQuantity = 1
            parsedScan = nil
            fetchedValue = ""
            fetchedTolerance = ""
            fetchedVoltage = ""
            fetchedPackage = ""
            fetchedManufacturer = ""
            fetchedDatasheetUrl = ""
            
            return response.partId
        } catch {
            statusMessage = settings.handleAPIError(error)
            return nil
        }
    }

    func fetchPartData(settings: SettingsStore) async {
        let pn = scannedName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !pn.isEmpty else {
            statusMessage = "Enter a part number in the Name field first."
            return
        }

        guard let client = settings.apiClient else {
            statusMessage = "Set a base URL first."
            return
        }

        guard !settings.requiresLogin else {
            statusMessage = "Authentication required. Log in below."
            return
        }

        isWorking = true
        defer { isWorking = false }

        // Clear existing fetched properties
        fetchedValue = ""
        fetchedTolerance = ""
        fetchedVoltage = ""
        fetchedPackage = ""
        fetchedManufacturer = ""
        fetchedDatasheetUrl = ""

        do {
            // 1. Resolve scan / check if part with same PN already exists in PartsBox
            let resolveResponse = try await client.resolveScan(raw: pn)
            if let existingPart = resolveResponse.part {
                existingPartId = existingPart.id
                existingPartPN = existingPart.pn
                showingExistingPartAlert = true
                statusMessage = "Part already exists: \(existingPart.pn)"
                return
            }

            // 2. Fetch data from DigiKey API
            let enrichResponse = try await client.enrichScan(raw: pn)
            
            if let name = enrichResponse.name, !name.isEmpty {
                scannedName = name
            }
            if let description = enrichResponse.description, !description.isEmpty {
                scannedDescription = description
            }
            if let categoryString = enrichResponse.category,
               let category = InventoryCategoryTaxonomy(rawValue: categoryString) {
                createCategory = category
            } else {
                createCategory = nil
            }
            
            fetchedValue = enrichResponse.value ?? ""
            fetchedTolerance = enrichResponse.tolerance ?? ""
            fetchedVoltage = enrichResponse.voltage ?? ""
            fetchedPackage = enrichResponse.package ?? ""
            fetchedManufacturer = enrichResponse.manufacturer ?? ""
            fetchedDatasheetUrl = enrichResponse.datasheetUrl ?? ""
            
            statusMessage = "Fetched data from DigiKey API."
        } catch {
            statusMessage = settings.handleAPIError(error)
        }
    }

    func updateCategory(settings: SettingsStore) async {
        guard let client = settings.apiClient else {
            statusMessage = "Set a base URL first."
            return
        }
        guard !settings.requiresLogin else {
            statusMessage = "Authentication required. Log in below."
            return
        }
        guard !selectedPartID.isEmpty else {
            statusMessage = "Choose a part first."
            return
        }

        isWorking = true
        defer { isWorking = false }

        do {
            let response = try await client.updateCategory(partID: selectedPartID, category: selectedCategory)
            if let updated = response.part {
                if let index = uncategorizedParts.firstIndex(where: { $0.id == updated.id }) {
                    uncategorizedParts[index] = MobilePartRowDTO(
                        id: updated.id,
                        section: updated.section,
                        value: updated.value,
                        pn: updated.pn,
                        quantity: updated.quantity,
                        description: updated.description,
                        manufacturer: updated.manufacturer,
                        category: updated.category,
                        categoryLabel: updated.categoryLabel,
                        tags: updated.tags,
                        syncStatus: updated.syncStatus,
                        syncError: updated.syncError,
                        price: updated.price,
                        currency: updated.currency,
                        datasheetUrl: updated.datasheetUrl,
                        tolerance: updated.tolerance,
                        voltage: updated.voltage,
                        package: updated.package
                    )
                }
            }
            statusMessage = "Updated category to \(selectedCategory.label)."
            if selectedCategory != .uncategorized {
                uncategorizedParts.removeAll { $0.id == selectedPartID }
                selectedPartID = uncategorizedParts.first?.id ?? ""
            }
        } catch {
            statusMessage = settings.handleAPIError(error)
        }
    }

    func createStorageLocation(name: String, settings: SettingsStore) async {
        guard let client = settings.apiClient else {
            statusMessage = "Set a base URL first."
            return
        }
        guard !settings.requiresLogin else {
            statusMessage = "Authentication required. Log in below."
            return
        }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            statusMessage = "Enter a location name."
            return
        }

        isWorking = true
        defer { isWorking = false }

        do {
            let response = try await client.createStorage(name: trimmed)
            let dto = MobileStorageDTO(id: response.id, name: response.name, label: response.label)
            if !storageOptions.contains(where: { $0.id == dto.id }) {
                storageOptions.append(dto)
            }
            selectedStorageID = dto.id
            settings.rememberLastStorage(dto.id)
            statusMessage = "Created location \(dto.displayName)."
        } catch {
            statusMessage = settings.handleAPIError(error)
        }
    }

    func removeStorageLocations(at offsets: IndexSet, settings: SettingsStore) async {
        guard let client = settings.apiClient else {
            statusMessage = "Set a base URL first."
            return
        }
        guard !settings.requiresLogin else {
            statusMessage = "Authentication required. Log in below."
            return
        }
        let targets = offsets.map { storageOptions[$0] }

        isWorking = true
        defer { isWorking = false }

        for storage in targets {
            do {
                _ = try await client.deleteStorage(id: storage.id)
                storageOptions.removeAll { $0.id == storage.id }
                if selectedStorageID == storage.id {
                    selectedStorageID = storageOptions.first?.id ?? ""
                }
                statusMessage = "Removed \(storage.displayName)."
            } catch {
                statusMessage = settings.handleAPIError(error)
            }
        }
    }
}

struct ManageView: View {
    @EnvironmentObject private var settingsStore: SettingsStore
    @EnvironmentObject private var printer: NiimbotPrinter
    @StateObject private var viewModel = ManageViewModel()
    @StateObject private var discovery = ServerDiscovery()
    @State private var authPassword = ""
    @State private var isPresentingNewLocation = false
    @State private var newLocationName = ""
    
    var onCreatedPart: ((String) -> Void)? = nil
    var onSelectStorage: ((String, String) -> Void)? = nil
    @FocusState private var isInputActive: Bool

    private var connectionSection: some View {
        Section("Connection") {
            TextField("Internal IP", text: settingsStore.binding(\.internalIP))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.numbersAndPunctuation)
                .focused($isInputActive)

            TextField("External IP", text: settingsStore.binding(\.externalIP))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.numbersAndPunctuation)
                .focused($isInputActive)

            TextField("Trusted SSID", text: settingsStore.binding(\.trustedSSID))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($isInputActive)

            TextField("Active Base URL", text: settingsStore.binding(\.activeBaseURL))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .focused($isInputActive)

            Button {
                discovery.search()
            } label: {
                Label(discovery.isSearching ? "Searching…" : "Discover on Casa", systemImage: "dot.radiowaves.left.and.right")
            }
            .disabled(discovery.isSearching)

            if let message = discovery.message {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var authenticationSection: some View {
        if settingsStore.resolvedBaseURL != nil {
            Section("Authentication") {
                if let session = settingsStore.authSession {
                    LabeledContent("State", value: "Signed in")
                    LabeledContent(
                        "Expires",
                        value: session.expirationDate.formatted(date: .abbreviated, time: .shortened)
                    )

                    if let notice = settingsStore.authNotice {
                        Text(notice)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Button(role: .destructive) {
                        authPassword = ""
                        settingsStore.logout()
                    } label: {
                        Label("Logout", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                } else {
                    if settingsStore.authAvailability == .disabled {
                        Text("Authentication is disabled on the server.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let notice = settingsStore.authNotice {
                            Text(notice)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        SecureField("Password", text: $authPassword)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($isInputActive)

                        Button {
                            let password = authPassword.trimmingCharacters(in: .whitespacesAndNewlines)
                            Task {
                                await settingsStore.login(password: password)
                                if settingsStore.authSession != nil {
                                    authPassword = ""
                                }
                            }
                        } label: {
                            Label("Login", systemImage: "lock.open")
                        }
                        .disabled(authPassword.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                        if let notice = settingsStore.authNotice {
                            Text(notice)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else if settingsStore.authAvailability == .unknown {
                            Text("Authentication status unavailable. Login may still work.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            Text("Authentication required.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var inventoryOverviewSection: some View {
        if viewModel.totalStockValue > 0 {
            Section("Inventory Overview") {
                LabeledContent(
                    "Total Stock Value",
                    value: formatCurrencyValue(viewModel.totalStockValue)
                )
                Text("Based on unit prices for parts with known pricing.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var syncSection: some View {
        Section("Sync") {
            Button {
                Task {
                    await viewModel.syncNow(settings: settingsStore)
                    await viewModel.loadLookups(settings: settingsStore)
                }
            } label: {
                Label(viewModel.isWorking ? "Working" : "Force Sync", systemImage: "arrow.triangle.2.circlepath")
            }
            .disabled(viewModel.isWorking || settingsStore.isOffline)
        }
    }

    private var labelPrinterSection: some View {
        Section("Label Printer") {
            if let id = printer.savedPrinterID {
                LabeledContent("Paired", value: printer.displayName(for: id))
                Button(role: .destructive) {
                    printer.forgetPrinter()
                } label: {
                    Label("Forget Printer", systemImage: "trash")
                }
            } else {
                Text("No printer paired")
                    .foregroundStyle(.secondary)
            }

            Picker("Label Size", selection: $printer.labelPaperSize) {
                ForEach(LabelPaperSize.allCases) { size in
                    Text(size.displayName).tag(size)
                }
            }

            Toggle("Rotate 180°", isOn: $printer.rotate180)
            Toggle("Mirror Print", isOn: $printer.mirrorHorizontally)

            HStack {
                Text("Vertical Offset")
                Spacer()
                TextField("Rows", value: $printer.verticalOffsetRows, format: .number)
                    .multilineTextAlignment(.trailing)
                    .keyboardType(.numbersAndPunctuation)
                    .textInputAutocapitalization(.never)
                    .focused($isInputActive)
                    .frame(width: 88)
            }

            Text("Positive values move the print down; negative values move it up.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Button {
                if printer.status == .scanning {
                    printer.stopScan()
                } else {
                    printer.startScan()
                }
            } label: {
                Label(printer.status == .scanning ? "Stop Scanning" : "Scan for Printers",
                      systemImage: printer.status == .scanning ? "stop.circle" : "dot.radiowaves.left.and.right")
            }

            if printer.status == .scanning, printer.discovered.isEmpty {
                HStack {
                    ProgressView()
                    Text("Searching…").foregroundStyle(.secondary)
                }
            }

            ForEach(printer.discovered) { device in
                Button {
                    printer.select(device.id)
                } label: {
                    HStack {
                        Image(systemName: "printer")
                        VStack(alignment: .leading) {
                            Text(device.name)
                            Text(device.id.uuidString)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if printer.savedPrinterID == device.id {
                            Image(systemName: "checkmark").foregroundStyle(.tint)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var scannerSection: some View {
        Section("Scanner") {
            TextField("Scanner Entry", text: $viewModel.scannerEntry)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($isInputActive)

            Button {
                Task {
                    await viewModel.parseScannerEntry(settings: settingsStore)
                }
            } label: {
                Label("Parse", systemImage: "barcode.viewfinder")
            }
            .disabled(viewModel.isWorking || viewModel.scannerEntry.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            if let parsedScan = viewModel.parsedScan {
                LabeledContent("Vendor", value: parsedScan.vendor)
                LabeledContent("Supplier PN", value: parsedScan.supplierPartNumber ?? "—")
                LabeledContent("MPN", value: parsedScan.manufacturerPartNumber ?? "—")
                LabeledContent("Quantity", value: parsedScan.quantity.map(String.init) ?? "—")
                LabeledContent("Confidence", value: parsedScan.confidence.formatted(.number.precision(.fractionLength(2))))
            }
        }
    }

    private var createPartSection: some View {
        Section("Create Part") {
            TextField("Name", text: $viewModel.scannedName)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($isInputActive)

            Button {
                Task {
                    await viewModel.fetchPartData(settings: settingsStore)
                }
            } label: {
                HStack {
                    if viewModel.isWorking {
                        ProgressView()
                            .padding(.trailing, 4)
                    }
                    Label("Fetch Data", systemImage: "arrow.down.circle")
                }
            }
            .disabled(viewModel.isWorking || settingsStore.isOffline || viewModel.scannedName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            TextField("Description", text: $viewModel.scannedDescription, axis: .vertical)
                .lineLimit(2...4)
                .focused($isInputActive)

            Picker("Storage", selection: $viewModel.selectedStorageID) {
                Text("Choose storage").tag("")
                ForEach(viewModel.storageOptions) { storage in
                    Text(storage.displayName).tag(storage.id)
                }
            }
            .pickerStyle(.menu)
            .onChange(of: viewModel.selectedStorageID) { _, storageID in
                settingsStore.rememberLastStorage(storageID)
            }

            Button {
                newLocationName = ""
                isPresentingNewLocation = true
            } label: {
                Label("New location…", systemImage: "plus")
            }
            .buttonStyle(.borderless)
            .disabled(viewModel.isWorking || settingsStore.isOffline)

            Picker("Category", selection: $viewModel.createCategory) {
                Text("Auto-detect").tag(InventoryCategoryTaxonomy?.none)
                ForEach(InventoryCategoryTaxonomy.allCases) { category in
                    Text(category.label).tag(InventoryCategoryTaxonomy?.some(category))
                }
            }
            .pickerStyle(.menu)

            Stepper("Quantity \(viewModel.scannedQuantity)", value: $viewModel.scannedQuantity, in: 1...100_000)

            if viewModel.createCategory != nil || !viewModel.fetchedValue.isEmpty || !viewModel.fetchedTolerance.isEmpty || !viewModel.fetchedManufacturer.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("PREVIEW / DETECTED INFO")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                        .padding(.top, 4)
                    LabeledContent("Category", value: viewModel.createCategory?.label ?? "Uncategorized")
                    if !viewModel.fetchedManufacturer.isEmpty {
                        LabeledContent("Manufacturer", value: viewModel.fetchedManufacturer)
                    }
                    if !viewModel.fetchedValue.isEmpty {
                        LabeledContent("Value", value: viewModel.fetchedValue)
                    }
                    if !viewModel.fetchedTolerance.isEmpty {
                        LabeledContent("Tolerance", value: viewModel.fetchedTolerance)
                    }
                    if !viewModel.fetchedVoltage.isEmpty {
                        LabeledContent("Voltage", value: viewModel.fetchedVoltage)
                    }
                    if !viewModel.fetchedPackage.isEmpty {
                        LabeledContent("Package", value: viewModel.fetchedPackage)
                    }
                    if !viewModel.fetchedDatasheetUrl.isEmpty {
                        LabeledContent("Datasheet", value: "Available")
                    }
                }
                .padding(.vertical, 4)
            }

            Button {
                Task {
                    if let partId = await viewModel.confirmScannerEntry(settings: settingsStore) {
                        onCreatedPart?(partId)
                    }
                }
            } label: {
                Label("Create Part", systemImage: "plus.circle.fill")
            }
            .disabled(
                viewModel.isWorking
                    || settingsStore.isOffline
                    || viewModel.selectedStorageID.isEmpty
                    || viewModel.scannedName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            )
        }
    }

    private var setCategorySection: some View {
        Section("Set Category") {
            Picker("Part", selection: $viewModel.selectedPartID) {
                Text("Choose part").tag("")
                ForEach(viewModel.uncategorizedParts) { part in
                    Text("\(part.pn) - \(part.description)").tag(part.id)
                }
            }
            .pickerStyle(.menu)

            Picker("Category", selection: $viewModel.selectedCategory) {
                ForEach(InventoryCategoryTaxonomy.allCases) { category in
                    Text(category.label).tag(category)
                }
            }
            .pickerStyle(.menu)

            if let selectedPart = viewModel.selectedPart {
                VStack(alignment: .leading, spacing: 4) {
                    Text(selectedPart.pn)
                        .font(.subheadline.weight(.semibold))
                    Text(selectedPart.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Button {
                Task {
                    await viewModel.updateCategory(settings: settingsStore)
                }
            } label: {
                Label("Save Category", systemImage: "tag.fill")
            }
            .disabled(viewModel.isWorking || settingsStore.isOffline || viewModel.selectedPartID.isEmpty)
        }
    }

    private var storageLocationsSection: some View {
        Section("Storage Locations") {
            if viewModel.storageOptions.isEmpty {
                Text("No storage locations.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                if settingsStore.isOffline {
                    ForEach(viewModel.storageOptions) { storage in
                        Button {
                            onSelectStorage?(storage.id, storage.displayName)
                        } label: {
                            HStack {
                                Text(storage.displayName)
                                    .foregroundStyle(.primary)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                } else {
                    ForEach(viewModel.storageOptions) { storage in
                        Button {
                            onSelectStorage?(storage.id, storage.displayName)
                        } label: {
                            HStack {
                                Text(storage.displayName)
                                    .foregroundStyle(.primary)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { offsets in
                        Task {
                            await viewModel.removeStorageLocations(at: offsets, settings: settingsStore)
                        }
                    }
                }
            }
        }
    }

    var body: some View {
        Form {
            if settingsStore.isOffline {
                Section {
                    HStack {
                        Image(systemName: "wifi.slash")
                        Text("Offline Mode — Edits Disabled")
                            .font(.subheadline.weight(.semibold))
                    }
                    .foregroundStyle(.orange)
                }
            }

            connectionSection
            authenticationSection
            inventoryOverviewSection
            syncSection
            labelPrinterSection
            scannerSection
            createPartSection
            setCategorySection
            storageLocationsSection

            if let statusMessage = viewModel.statusMessage {
                Section {
                    Text(statusMessage)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    isInputActive = false
                }
            }
        }
        .navigationTitle(InventorySection.manage.title)
        .alert("New storage location", isPresented: $isPresentingNewLocation) {
            TextField("Name", text: $newLocationName)
            Button("Cancel", role: .cancel) {}
            Button("Create") {
                Task {
                    await viewModel.createStorageLocation(name: newLocationName, settings: settingsStore)
                }
            }
        } message: {
            Text("Create a new storage location in PartsBox.")
        }
        .alert("Part Already Exists", isPresented: $viewModel.showingExistingPartAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Open Part") {
                if !viewModel.existingPartId.isEmpty {
                    onCreatedPart?(viewModel.existingPartId)
                }
            }
        } message: {
            Text("A part with PN '\(viewModel.existingPartPN)' already exists in the inventory. Would you like to open it to add stock?")
        }
        .task(id: "\(settingsStore.resolvedBaseURL?.absoluteString ?? "nil")-\(settingsStore.authRevision)") {
            await settingsStore.refreshAuthStatus()
            await viewModel.loadLookups(settings: settingsStore)
        }
        .onChange(of: discovery.discoveredURL) { _, url in
            guard let url else {
                return
            }
            settingsStore.useDiscoveredServer(url)
            viewModel.statusMessage = "Connected to \(url.absoluteString)"
        }
    }
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

private func formatCurrencyValue(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.currencyCode = "USD"
    formatter.minimumFractionDigits = 2
    formatter.maximumFractionDigits = 2
    return formatter.string(from: NSNumber(value: value)) ?? String(format: "$%.2f", value)
}
