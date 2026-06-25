import Combine
import SwiftUI

@MainActor
final class PartDetailViewModel: ObservableObject {
    @Published var part: MobilePartDetailDTO?
    @Published var isLoading = false
    @Published var isAdjusting = false
    @Published var isAddingStock = false
    @Published var isUpdatingMetadata = false
    @Published var isDeleting = false
    @Published var errorMessage: String?

    func load(partID: String, settings: SettingsStore) async {
        guard let client = settings.apiClient else {
            errorMessage = "Set a base URL in Manage."
            part = nil
            return
        }

        guard !settings.requiresLogin else {
            errorMessage = "Authentication required. Log in from Manage."
            part = nil
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            part = try await client.fetchPart(id: partID)
            errorMessage = nil
        } catch {
            part = nil
            errorMessage = settings.handleAPIError(error)
        }
    }

    func adjust(
        delta: Int,
        location: MobilePartLocationDTO,
        partID: String,
        settings: SettingsStore
    ) async {
        guard let client = settings.apiClient else {
            errorMessage = "Set a base URL in Manage."
            return
        }

        guard !settings.requiresLogin else {
            errorMessage = "Authentication required. Log in from Manage."
            return
        }

        isAdjusting = true
        defer { isAdjusting = false }

        do {
            let response = try await client.adjustStock(
                partID: partID,
                storageID: location.storageId,
                delta: delta
            )
            if let updatedPart = response.part {
                part = updatedPart
            } else {
                await load(partID: partID, settings: settings)
            }
            errorMessage = nil
        } catch {
            errorMessage = settings.handleAPIError(error)
        }
    }

    func pullDetails(
        partID: String,
        settings: SettingsStore
    ) async {
        guard let client = settings.apiClient else {
            errorMessage = "Set a base URL in Manage."
            return
        }

        guard !settings.requiresLogin else {
            errorMessage = "Authentication required. Log in from Manage."
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response = try await client.pullDetails(partID: partID)
            if let updatedPart = response.part {
                part = updatedPart
            } else {
                await load(partID: partID, settings: settings)
            }
        } catch {
            errorMessage = settings.handleAPIError(error)
        }
    }

    func addStock(
        partID: String,
        storageID: String,
        quantity: Int,
        note: String?,
        settings: SettingsStore
    ) async {
        guard let client = settings.apiClient else {
            errorMessage = "Set a base URL in Manage."
            return
        }

        guard !settings.requiresLogin else {
            errorMessage = "Authentication required. Log in from Manage."
            return
        }

        isAddingStock = true
        defer { isAddingStock = false }

        do {
            let response = try await client.adjustStock(
                partID: partID,
                storageID: storageID,
                delta: quantity,
                note: note
            )
            if let updatedPart = response.part {
                part = updatedPart
            } else {
                await load(partID: partID, settings: settings)
            }
            errorMessage = nil
        } catch {
            errorMessage = settings.handleAPIError(error)
        }
    }

    func updateMetadata(
        partID: String,
        category: InventoryCategoryTaxonomy,
        tag: String?,
        settings: SettingsStore
    ) async {
        guard let client = settings.apiClient else {
            errorMessage = "Set a base URL in Manage."
            return
        }

        guard !settings.requiresLogin else {
            errorMessage = "Authentication required. Log in from Manage."
            return
        }

        isUpdatingMetadata = true
        defer { isUpdatingMetadata = false }

        do {
            let response = try await client.updateCategory(partID: partID, category: category, tag: tag)
            if let updatedPart = response.part {
                part = updatedPart
            } else {
                await load(partID: partID, settings: settings)
            }
            errorMessage = nil
        } catch {
            errorMessage = settings.handleAPIError(error)
        }
    }

    func deletePart(partID: String, settings: SettingsStore) async -> Bool {
        guard let client = settings.apiClient else {
            errorMessage = "Set a base URL in Manage."
            return false
        }

        guard !settings.requiresLogin else {
            errorMessage = "Authentication required. Log in from Manage."
            return false
        }

        isDeleting = true
        defer { isDeleting = false }

        do {
            _ = try await client.deletePart(partID: partID)
            part = nil
            errorMessage = nil
            return true
        } catch {
            errorMessage = settings.handleAPIError(error)
            return false
        }
    }
}

struct PartDetailView: View {
    let partID: String
    var onSynced: ((String) -> Void)? = nil
    let onDeleted: (() -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settingsStore: SettingsStore
    @StateObject private var viewModel = PartDetailViewModel()
    @State private var isPresentingAddStock = false
    @State private var isPresentingMetadataEditor = false
    @State private var isConfirmingDelete = false
    @State private var isPresentingPrintSheet = false

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.part == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let part = viewModel.part {
                List {
                    Section {
                        LabeledContent("Value", value: part.value ?? "—")
                        LabeledContent("PN", value: part.pn)
                        if let manufacturer = part.manufacturer, !manufacturer.isEmpty {
                            LabeledContent("Manufacturer", value: manufacturer)
                        }
                        LabeledContent("Category", value: part.categoryLabel ?? part.category ?? "Uncategorized")
                        LabeledContent("Quantity", value: part.quantity.formatted())
                        if let price = part.price {
                            let currencySymbol = part.currency?.uppercased() ?? "USD"
                            LabeledContent("Cost", value: String(format: "%.4f %@", price, currencySymbol))
                        }
                        if let tolerance = part.tolerance {
                            LabeledContent("Tolerance", value: tolerance)
                        }
                        if let voltage = part.voltage {
                            LabeledContent("Voltage", value: voltage)
                        }
                        if let package = part.package {
                            LabeledContent("Package", value: package)
                        }
                        if let urlString = part.datasheetUrl, let url = URL(string: urlString) {
                            Link(destination: url) {
                                LabeledContent("Datasheet", value: "📄 Open PDF Link")
                            }
                        }
                        if let status = part.syncStatus {
                            PartSyncStatusView(status: status, error: part.syncError)
                        }
                    }

                    if !part.displayTags.isEmpty {
                        Section {
                            PartTagWrap(tags: part.displayTags)
                        }
                    }

                    Section("Description") {
                        Text(part.description)
                            .font(.body)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Section("Locations") {
                        ForEach(part.locations) { location in
                            LocationAdjustmentRow(
                                location: location,
                                isAdjusting: viewModel.isAdjusting
                            ) { delta in
                                Task {
                                    await viewModel.adjust(
                                        delta: delta,
                                        location: location,
                                        partID: partID,
                                        settings: settingsStore
                                    )
                                }
                            }
                        }
                    }

                    if let errorMessage = viewModel.errorMessage {
                        Section {
                            Text(errorMessage)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .sheet(isPresented: $isPresentingAddStock) {
                    if let part = viewModel.part {
                        PartDetailAddStockSheet(
                            part: part,
                            settingsStore: settingsStore,
                            isAddingStock: viewModel.isAddingStock,
                            onCancel: {
                                isPresentingAddStock = false
                            },
                            onSave: { storageID, quantity, note in
                                Task {
                                    await viewModel.addStock(
                                        partID: partID,
                                        storageID: storageID,
                                        quantity: quantity,
                                        note: note,
                                        settings: settingsStore
                                    )
                                    if viewModel.errorMessage == nil {
                                        settingsStore.rememberLastStorage(storageID)
                                        isPresentingAddStock = false
                                    }
                                }
                            }
                        )
                    }
                }
                .sheet(isPresented: $isPresentingMetadataEditor) {
                    if let part = viewModel.part {
                        PartMetadataEditSheet(
                            part: part,
                            isSaving: viewModel.isUpdatingMetadata,
                            onCancel: {
                                isPresentingMetadataEditor = false
                            },
                            onSave: { category, tag in
                                Task {
                                    await viewModel.updateMetadata(
                                        partID: partID,
                                        category: category,
                                        tag: tag,
                                        settings: settingsStore
                                    )
                                    if viewModel.errorMessage == nil {
                                        isPresentingMetadataEditor = false
                                    }
                                }
                            }
                        )
                    }
                }
            } else if let errorMessage = viewModel.errorMessage {
                ContentUnavailableView(errorMessage, systemImage: "exclamationmark.triangle")
            } else {
                ContentUnavailableView("No part", systemImage: "shippingbox")
            }
        }
        .navigationTitle(viewModel.part?.pn ?? "Part")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        isPresentingAddStock = true
                    } label: {
                        Label("Add Location Stock", systemImage: "plus.circle")
                    }

                    Button {
                        isPresentingMetadataEditor = true
                    } label: {
                        Label("Edit Category", systemImage: "tag")
                    }

                    Button {
                        Task {
                            await viewModel.pullDetails(partID: partID, settings: settingsStore)
                        }
                    } label: {
                        Label("Pull Details", systemImage: "arrow.clockwise.circle")
                    }
                    .disabled(viewModel.isLoading)

                    Button {
                        isPresentingPrintSheet = true
                    } label: {
                        Label("Print Label", systemImage: "printer")
                    }

                    Button(role: .destructive) {
                        isConfirmingDelete = true
                    } label: {
                        Label("Delete Part", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .disabled(viewModel.part == nil || viewModel.isDeleting)
            }
        }
        .confirmationDialog(
            "Delete this part?",
            isPresented: $isConfirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete Part", role: .destructive) {
                Task {
                    if await viewModel.deletePart(partID: partID, settings: settingsStore) {
                        if let onDeleted {
                            onDeleted()
                        } else {
                            dismiss()
                        }
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes the part locally immediately and queues the PartsBox delete.")
        }
        .sheet(isPresented: $isPresentingPrintSheet) {
            PrintLabelSheet(partID: partID)
        }
        .refreshable {
            await viewModel.load(partID: partID, settings: settingsStore)
        }
        .task(id: "\(settingsStore.resolvedBaseURL?.absoluteString ?? partID)-\(settingsStore.authRevision)") {
            await viewModel.load(partID: partID, settings: settingsStore)
            
            // If it's a local pending part, poll every 2 seconds until it is synced
            if partID.hasPrefix("local") {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(2))
                    if viewModel.part?.id != partID {
                        break
                    }
                    await viewModel.load(partID: partID, settings: settingsStore)
                }
            }
        }
        .onChange(of: viewModel.part?.id) { _, newID in
            if let newID, newID != partID {
                onSynced?(newID)
            }
        }
    }
}

private struct PartSyncStatusView: View {
    let status: String
    let error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabeledContent("Sync", value: label)
            if let error, !error.isEmpty {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var label: String {
        switch status {
        case "pending":
            return "Local pending"
        case "syncing":
            return "Syncing"
        case "failed":
            return "Local failed"
        default:
            return status
        }
    }
}

private struct PartTagWrap: View {
    let tags: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tags, id: \.self) { tag in
                    Text(partTagDisplayName(tag))
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color.secondary.opacity(0.18), in: Capsule())
                }
            }
        }
    }
}

private struct PartMetadataEditSheet: View {
    let part: MobilePartDetailDTO
    let isSaving: Bool
    let onCancel: () -> Void
    let onSave: (InventoryCategoryTaxonomy, String?) -> Void

    @State private var selectedCategory: InventoryCategoryTaxonomy
    @State private var selectedTag: String
    @State private var customTag: String

    init(
        part: MobilePartDetailDTO,
        isSaving: Bool,
        onCancel: @escaping () -> Void,
        onSave: @escaping (InventoryCategoryTaxonomy, String?) -> Void
    ) {
        self.part = part
        self.isSaving = isSaving
        self.onCancel = onCancel
        self.onSave = onSave
        _selectedCategory = State(initialValue: part.category.flatMap(InventoryCategoryTaxonomy.init(rawValue:)) ?? .uncategorized)
        _selectedTag = State(initialValue: part.displayTags.first ?? "")
        _customTag = State(initialValue: "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Part") {
                    LabeledContent("PN", value: part.pn)
                    LabeledContent("Current", value: part.categoryLabel ?? part.category ?? "Uncategorized")
                }

                Section("Category") {
                    Picker("Category", selection: $selectedCategory) {
                        ForEach(InventoryCategoryTaxonomy.allCases) { category in
                            Text(category.label).tag(category)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section("Tag") {
                    Picker("Existing", selection: $selectedTag) {
                        Text("None").tag("")
                        ForEach(part.displayTags, id: \.self) { tag in
                            Text(partTagDisplayName(tag)).tag(tag)
                        }
                    }
                    .pickerStyle(.menu)

                    TextField("New tag", text: $customTag)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Button {
                    let trimmedCustom = customTag.trimmingCharacters(in: .whitespacesAndNewlines)
                    let tag = trimmedCustom.isEmpty ? selectedTag.nilIfBlank : trimmedCustom
                    onSave(selectedCategory, tag)
                } label: {
                    Label(isSaving ? "Saving..." : "Save", systemImage: "checkmark.circle.fill")
                }
                .disabled(isSaving)
            }
            .navigationTitle("Edit Part")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel", action: onCancel)
                }
            }
        }
    }
}

private struct PartDetailAddStockSheet: View {
    let part: MobilePartDetailDTO
    let settingsStore: SettingsStore
    let isAddingStock: Bool
    let onCancel: () -> Void
    let onSave: (String, Int, String?) -> Void

    @State private var storageOptions: [MobileStorageDTO] = []
    @State private var selectedStorageID = ""
    @State private var quantity = 1
    @State private var note = ""
    @State private var statusMessage: String?
    @State private var isPresentingNewLocation = false
    @State private var newLocationName = ""
    @State private var isWorking = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Part") {
                    LabeledContent("PN", value: part.pn)
                    LabeledContent("Quantity", value: part.quantity.formatted())
                    LabeledContent("Category", value: part.categoryLabel ?? part.category ?? "Uncategorized")
                }

                Section("Add Stock") {
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
                    .disabled(isWorking || isAddingStock)

                    Stepper("Quantity \(quantity)", value: $quantity, in: 1...100_000)

                    TextField("Note", text: $note, axis: .vertical)
                        .lineLimit(2...4)

                    Button {
                        onSave(selectedStorageID, quantity, note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : note)
                    } label: {
                        Label(isAddingStock ? "Adding…" : "Add Stock", systemImage: "plus.circle.fill")
                    }
                    .disabled(isWorking || isAddingStock || selectedStorageID.isEmpty)
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
            .task(id: "\(settingsStore.resolvedBaseURL?.absoluteString ?? part.id)-\(settingsStore.authRevision)") {
                await loadStorage()
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
            storageOptions = []
            return
        }

        do {
            let response = try await client.fetchStorage()
            storageOptions = response.storage
            if selectedStorageID.isEmpty {
                selectedStorageID = response.storage.first { $0.id == settingsStore.settings.lastStorageID }?.id
                    ?? part.locations.first?.storageId
                    ?? response.storage.first?.id
                    ?? ""
            }
        } catch {
            statusMessage = settingsStore.handleAPIError(error)
        }
    }
}

private struct LocationAdjustmentRow: View {
    let location: MobilePartLocationDTO
    let isAdjusting: Bool
    let adjust: (Int) -> Void

    @State private var isShowingEditAlert = false
    @State private var editQuantityText = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(location.name)
                        .font(.headline)
                    Text(location.storageId)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Spacer()

                Button {
                    editQuantityText = String(location.quantity)
                    isShowingEditAlert = true
                } label: {
                    HStack(spacing: 6) {
                        Text(location.quantity.formatted())
                            .monospacedDigit()
                            .font(.body.weight(.semibold))
                        Image(systemName: "pencil.circle.fill")
                            .foregroundStyle(.tint)
                    }
                }
                .buttonStyle(.borderless)
                .disabled(isAdjusting)
            }

            HStack(spacing: 12) {
                Button {
                    adjust(-1)
                } label: {
                    Image(systemName: "minus.circle.fill")
                }
                .buttonStyle(.borderless)
                .disabled(isAdjusting)

                Spacer()

                Button {
                    adjust(1)
                } label: {
                    Image(systemName: "plus.circle.fill")
                }
                .buttonStyle(.borderless)
                .disabled(isAdjusting)
            }
            .font(.title3)
        }
        .padding(.vertical, 4)
        .alert("Edit Quantity", isPresented: $isShowingEditAlert) {
            TextField("Quantity", text: $editQuantityText)
                #if os(iOS)
                .keyboardType(.numberPad)
                #endif
            Button("Cancel", role: .cancel) { }
            Button("Save") {
                if let newQty = Int(editQuantityText.trimmingCharacters(in: .whitespacesAndNewlines)) {
                    let delta = newQty - location.quantity
                    if delta != 0 {
                        adjust(delta)
                    }
                }
            }
        } message: {
            Text("Enter the new stock quantity for \(location.name).")
        }
    }
}

private func partTagDisplayName(_ tag: String) -> String {
    tag
        .replacingOccurrences(of: "pbm-category-", with: "")
        .replacingOccurrences(of: "-", with: " ")
        .replacingOccurrences(of: "_", with: " ")
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
