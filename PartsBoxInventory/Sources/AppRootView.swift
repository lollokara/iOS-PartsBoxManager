import SwiftUI

struct AppRootView: View {
    @State private var selectedTab: RootTab = .inventory
    @State private var inventoryPath: [InventoryRoute] = []
    @State private var managePath: [InventoryRoute] = []
    @State private var historyPath: [InventoryRoute] = []

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack(path: $inventoryPath) {
                InventoryHomeView(
                    openManage: {
                        selectedTab = .manage
                    },
                    openPart: { partID in
                        inventoryPath.append(.part(partID))
                    },
                    openStorage: { id, name in
                        inventoryPath.append(.storage(id: id, name: name))
                    }
                )
                .navigationDestination(for: InventoryRoute.self) { route in
                    switch route {
                    case let .part(partID):
                        PartDetailView(partID: partID, onSynced: { remoteID in
                            if let index = inventoryPath.firstIndex(of: .part(partID)) {
                                inventoryPath[index] = .part(remoteID)
                            }
                        })
                    case let .storage(id, name):
                        StorageLocationPartsView(storageID: id, name: name)
                    }
                }
            }
            .tabItem {
                Label("Inventory", systemImage: "shippingbox")
            }
            .tag(RootTab.inventory)
 
            NavigationStack(path: $managePath) {
                ManageView(onCreatedPart: { partID in
                    managePath.append(.part(partID))
                }, onSelectStorage: { id, name in
                    managePath.append(.storage(id: id, name: name))
                })
                .navigationDestination(for: InventoryRoute.self) { route in
                    switch route {
                    case let .part(partID):
                        PartDetailView(partID: partID, onSynced: { remoteID in
                            if let index = managePath.firstIndex(of: .part(partID)) {
                                managePath[index] = .part(remoteID)
                            }
                        })
                    case let .storage(id, name):
                        StorageLocationPartsView(storageID: id, name: name)
                    }
                }
            }
            .tabItem {
                Label(InventorySection.manage.title, systemImage: InventorySection.manage.systemImage)
            }
            .tag(RootTab.manage)

            NavigationStack(path: $historyPath) {
                HistoryView(openPart: { partID in
                    historyPath.append(.part(partID))
                })
                .navigationDestination(for: InventoryRoute.self) { route in
                    switch route {
                    case let .part(partID):
                        PartDetailView(partID: partID, onSynced: { remoteID in
                            if let index = historyPath.firstIndex(of: .part(partID)) {
                                historyPath[index] = .part(remoteID)
                            }
                        })
                    case let .storage(id, name):
                        StorageLocationPartsView(storageID: id, name: name)
                    }
                }
            }
            .tabItem {
                Label("History", systemImage: "clock")
            }
            .tag(RootTab.history)
        }
    }
}

enum InventoryRoute: Hashable {
    case part(String)
    case storage(id: String, name: String)
}

private enum RootTab {
    case inventory
    case manage
    case history
}

struct HistoryView: View {
    let openPart: (String) -> Void

    @EnvironmentObject private var settingsStore: SettingsStore
    @State private var history: [HistoryEntryDTO] = []
    @State private var isWorking = false
    @State private var statusMessage: String?
    @State private var timer: Timer? = nil

    var body: some View {
        List {
            if isWorking && history.isEmpty {
                Section {
                    HStack {
                        Spacer()
                        ProgressView("Loading history...")
                        Spacer()
                    }
                }
            } else if history.isEmpty {
                Section {
                    VStack(alignment: .center, spacing: 12) {
                        Spacer()
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.largeTitle)
                            .foregroundStyle(.secondary)
                        Text("No history entries recorded yet.")
                            .foregroundStyle(.secondary)
                            .font(.subheadline)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, minHeight: 150)
                }
            } else {
                ForEach(history) { entry in
                    Button {
                        if entry.type != "delete-part" {
                            openPart(entry.partId)
                        }
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            iconView(for: entry)
                                .font(.body)
                                .frame(width: 32, height: 32)
                                .background(iconColor(for: entry).opacity(0.15))
                                .foregroundStyle(iconColor(for: entry))
                                .clipShape(Circle())
                            
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(alignment: .top) {
                                    Text(actionTitle(for: entry))
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    statusIndicator(for: entry)
                                }
                                
                                Text(entry.partName)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                
                                if let detail = actionDetail(for: entry) {
                                    Text(detail)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                
                                if let note = entry.note, !note.isEmpty, entry.type != "sync-local-to-cloud", !note.starts(with: "Create pending") && !note.starts(with: "Created part") {
                                    Text("Note: \(note)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                
                                if let error = entry.error, !error.isEmpty {
                                    Text("Error: \(error)")
                                        .font(.caption)
                                        .foregroundStyle(.red)
                                }
                                
                                Text(entry.date, style: .time)
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
            }

            if let statusMessage {
                Section {
                    Text(statusMessage)
                        .foregroundStyle(.secondary)
                        .font(.footnote)
                }
            }
        }
        .navigationTitle("History")
        .refreshable {
            await loadHistory(silent: true)
        }
        .task {
            await loadHistory(silent: false)
            startPolling()
        }
        .onDisappear {
            stopPolling()
        }
    }

    private func startPolling() {
        stopPolling()
        timer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { _ in
            Task {
                await loadHistory(silent: true)
            }
        }
    }

    private func stopPolling() {
        timer?.invalidate()
        timer = nil
    }

    private func loadHistory(silent: Bool) async {
        guard let client = settingsStore.apiClient else {
            statusMessage = "Set a base URL in Manage."
            return
        }
        guard !settingsStore.requiresLogin else {
            statusMessage = "Log in from Manage to view history."
            return
        }

        if !silent {
            isWorking = true
        }
        statusMessage = nil

        do {
            let response = try await client.fetchHistory()
            if response.history != history {
                history = response.history
            }
        } catch {
            statusMessage = settingsStore.handleAPIError(error)
        }
        
        if !silent {
            isWorking = false
        }
    }

    private func actionTitle(for entry: HistoryEntryDTO) -> String {
        switch entry.type {
        case "create-part":
            return "Created Part"
        case "stock-adjust":
            if let qty = entry.quantity {
                return qty >= 0 ? "Added Stock" : "Reduced Stock"
            }
            return "Stock Adjusted"
        case "delete-part":
            return "Deleted Part"
        case "category-change":
            return "Changed Category"
        case "sync-local-to-cloud":
            return "Synced to Cloud"
        default:
            return "Stock Movement"
        }
    }

    private func actionDetail(for entry: HistoryEntryDTO) -> String? {
        var details: [String] = []
        if let qty = entry.quantity {
            let prefix = qty >= 0 ? "+" : ""
            details.append("\(prefix)\(qty) pcs")
        }
        if let storage = entry.storageName ?? entry.storageId, !storage.isEmpty {
            details.append("in \(storage)")
        }
        
        if entry.type == "sync-local-to-cloud" {
            return "Moved local pending part to PartsBox"
        }
        
        return details.isEmpty ? nil : details.joined(separator: " ")
    }

    @ViewBuilder
    private func iconView(for entry: HistoryEntryDTO) -> some View {
        switch entry.type {
        case "create-part":
            Image(systemName: "plus.circle.fill")
        case "stock-adjust":
            Image(systemName: "shippingbox.fill")
        case "delete-part":
            Image(systemName: "trash.fill")
        case "category-change":
            Image(systemName: "tag.fill")
        case "sync-local-to-cloud":
            Image(systemName: "icloud.and.arrow.up.fill")
        default:
            Image(systemName: "arrow.left.and.right.circle.fill")
        }
    }

    private func iconColor(for entry: HistoryEntryDTO) -> Color {
        switch entry.type {
        case "create-part":
            return .blue
        case "stock-adjust":
            if let qty = entry.quantity {
                return qty >= 0 ? .green : .orange
            }
            return .green
        case "delete-part":
            return .red
        case "category-change":
            return .purple
        case "sync-local-to-cloud":
            return .teal
        default:
            return .gray
        }
    }

    @ViewBuilder
    private func statusIndicator(for entry: HistoryEntryDTO) -> some View {
        switch entry.status {
        case "pending":
            HStack(spacing: 4) {
                ProgressView()
                    .scaleEffect(0.6)
                Text("Pending")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.orange.opacity(0.1))
            .cornerRadius(4)
        case "failed":
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.caption2)
                    .foregroundStyle(.red)
                Text("Failed")
                    .font(.caption2)
                    .foregroundStyle(.red)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.red.opacity(0.1))
            .cornerRadius(4)
        default:
            EmptyView()
        }
    }
}
