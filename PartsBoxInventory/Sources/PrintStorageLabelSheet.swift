import SwiftUI
import UIKit

struct PrintStorageLabelSheet: View {
    let storageID: String
    let initialName: String

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settingsStore: SettingsStore
    @EnvironmentObject private var printer: NiimbotPrinter

    @State private var labelText: String
    @State private var labelImage: UIImage?
    @State private var pngData: Data?
    @State private var loadError: String?
    @State private var didStart = false
    @State private var isConfirmingPrint = false

    init(storageID: String, initialName: String) {
        self.storageID = storageID
        self.initialName = initialName
        _labelText = State(initialValue: initialName)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Preview") {
                    VStack(spacing: 12) {
                        if let labelImage {
                            Image(uiImage: labelImage)
                                .resizable()
                                .interpolation(.none)
                                .scaledToFit()
                                .frame(maxHeight: 120)
                                .frame(maxWidth: .infinity)
                                .padding(8)
                                .background(Color.white)
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.3)))
                        } else if loadError == nil {
                            ProgressView("Rendering label…")
                                .frame(maxWidth: .infinity, maxHeight: 120)
                        }

                        if let loadError {
                            Text(loadError)
                                .font(.footnote)
                                .foregroundStyle(.red)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("Label Configuration") {
                    TextField("Label Text", text: $labelText)
                        .textInputAutocapitalization(.words)
                }

                Section("Printer Status") {
                    if printer.savedPrinterID == nil {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("No printer paired")
                                .font(.subheadline.weight(.semibold))
                            Text("Pair a label printer in Manage → Label Printer.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        HStack(spacing: 8) {
                            statusIcon
                            Text(printer.status.displayText)
                                .font(.subheadline)
                        }

                        if let progress = printer.jobProgress {
                            VStack(alignment: .leading, spacing: 4) {
                                ProgressView(value: progress)
                                Text(printer.jobProgressMessage ?? printer.status.displayText)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } else if printer.status.isActive {
                            ProgressView()
                        }
                    }
                }

                if case .failed = printer.status {
                    Section {
                        Button("Retry Print", systemImage: "arrow.clockwise") {
                            Task { await startPrint() }
                        }
                    }
                } else if printer.status == .done {
                    Section {
                        Button("Print Again", systemImage: "printer") {
                            Task { await startPrint() }
                        }
                    }
                }
            }
            .navigationTitle("Print Storage Label")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if printer.savedPrinterID != nil, pngData != nil, !didStart, !printer.status.isActive {
                        Button("Print") {
                            isConfirmingPrint = true
                        }
                        .bold()
                    }
                }
            }
            .confirmationDialog(
                "Print this label?",
                isPresented: $isConfirmingPrint,
                titleVisibility: .visible
            ) {
                Button("Print", role: .destructive) {
                    Task { await startPrint() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Confirm to send the label to the printer.")
            }
            .task(id: labelText) {
                do {
                    // Slight debounce to avoid rendering too frequently while typing
                    try await Task.sleep(for: .milliseconds(300))
                    await fetchLabel()
                } catch {
                    // Task cancelled, ignore
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder private var statusIcon: some View {
        switch printer.status {
        case .done:
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .failed:
            Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
        default:
            if printer.status.isActive {
                ProgressView()
            } else {
                Image(systemName: "printer").foregroundStyle(.secondary)
            }
        }
    }

    private func fetchLabel() async {
        printer.resetStatus()
        guard let client = settingsStore.apiClient else {
            loadError = "Set a base URL in Manage."
            return
        }
        guard !settingsStore.requiresLogin else {
            loadError = "Log in from Manage to print."
            return
        }

        loadError = nil
        do {
            let data = try await client.fetchStorageLabelImage(
                storageID: storageID,
                text: labelText,
                paperSize: printer.labelPaperSize
            )
            pngData = data
            labelImage = UIImage(data: data)
        } catch {
            loadError = settingsStore.handleAPIError(error)
        }
    }

    private func startPrint() async {
        guard let data = pngData else { return }
        didStart = true
        try? await printer.print(pngData: data)
    }
}
