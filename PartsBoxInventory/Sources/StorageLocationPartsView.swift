import SwiftUI

struct StorageLocationPartsView: View {
    let storageID: String
    let name: String

    @EnvironmentObject private var settingsStore: SettingsStore
    @State private var parts: [MobilePartRowDTO] = []
    @State private var isWorking = false
    @State private var statusMessage: String?
    @State private var searchText = ""
    @State private var isPresentingPrintLabel = false

    private var filteredParts: [MobilePartRowDTO] {
        if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return parts
        }
        return parts.filter { part in
            part.pn.localizedCaseInsensitiveContains(searchText) ||
            part.description.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        List {
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

            if isWorking && parts.isEmpty {
                Section {
                    HStack {
                        Spacer()
                        ProgressView("Loading parts...")
                        Spacer()
                    }
                }
            } else if parts.isEmpty {
                Section {
                    Text("No parts in this location.")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                }
            } else {
                Section {
                    ForEach(filteredParts) { row in
                        NavigationLink(value: InventoryRoute.part(row.id)) {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(row.pn)
                                        .font(.headline)
                                    Spacer()
                                    if row.quantity > 0 {
                                        Text("\(row.quantity) pcs")
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    } else {
                                        Text("out of stock")
                                            .font(.subheadline.italic())
                                            .foregroundStyle(.red)
                                    }
                                }
                                Text(row.description)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                    }
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
        .searchable(text: $searchText, prompt: "Search parts")
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isPresentingPrintLabel = true
                } label: {
                    Label("Print Label", systemImage: "printer")
                }
            }
        }
        .refreshable {
            await loadParts()
        }
        .sheet(isPresented: $isPresentingPrintLabel) {
            PrintStorageLabelSheet(storageID: storageID, initialName: name)
        }
        .task {
            await loadParts()
        }
    }

    private func loadParts() async {
        // Optimistic / Offline cache load
        if let cached = settingsStore.getCachedStorageParts(storageID: storageID) {
            parts = cached
        }

        guard let client = settingsStore.apiClient else {
            statusMessage = "Set a base URL in Manage."
            return
        }
        guard !settingsStore.requiresLogin else {
            statusMessage = "Log in from Manage to view parts."
            return
        }

        isWorking = true
        statusMessage = nil
        defer { isWorking = false }

        do {
            let response = try await client.fetchPartsForStorage(storageID: storageID)
            parts = response.parts
            settingsStore.cacheStorageParts(storageID: storageID, parts: response.parts)
            settingsStore.setOffline(false)
        } catch {
            if settingsStore.isNetworkError(error) {
                settingsStore.setOffline(true)
                if let cached = settingsStore.getCachedStorageParts(storageID: storageID) {
                    parts = cached
                    statusMessage = "Offline Mode: Showing cached data."
                    return
                }
            }
            statusMessage = settingsStore.handleAPIError(error)
        }
    }
}
