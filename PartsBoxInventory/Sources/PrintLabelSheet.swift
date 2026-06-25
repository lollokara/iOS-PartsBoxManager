import SwiftUI
import UIKit

/// Compact popup that fetches the server-rendered label, previews it, and drives the BLE
/// print, reflecting the printer's stages (finding → found → initializing → printing → done).
struct PrintLabelSheet: View {
    let partID: String

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settingsStore: SettingsStore
    @EnvironmentObject private var printer: NiimbotPrinter

    @State private var labelImage: UIImage?
    @State private var pngData: Data?
    @State private var loadError: String?
    @State private var didStart = false
    @State private var isConfirmingPrint = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                VStack(spacing: 18) {
                    preview
                    statusSection
                    progressSection
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                .padding(.horizontal)
                .padding(.top, 16)
            }
            .navigationTitle("Print Label")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                actions
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
            }
        }
        .presentationDetents([.medium])
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
            Text("Review the preview before sending it to the paired printer.")
        }
        .task { await begin() }
    }

    // MARK: - Sections

    @ViewBuilder private var preview: some View {
        if let labelImage {
            Image(uiImage: labelImage)
                .resizable()
                .interpolation(.none)
                .scaledToFit()
                .frame(maxHeight: 130)
                .frame(maxWidth: .infinity)
                .padding(8)
                .background(Color.white)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.3)))
        } else if loadError == nil {
            ProgressView("Rendering label…")
                .frame(maxWidth: .infinity, maxHeight: 130)
        }
    }

    @ViewBuilder private var statusSection: some View {
        if let loadError {
            Label(loadError, systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
        } else if printer.savedPrinterID == nil {
            VStack(spacing: 6) {
                Label("No printer paired", systemImage: "printer.dotmatrix")
                Text("Pair a label printer in Manage → Label Printer, then print.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        } else {
            VStack(spacing: 10) {
                statusIcon
                Text(printer.status.displayText)
                    .font(.callout)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder private var progressSection: some View {
        if let progress = printer.jobProgress {
            VStack(spacing: 8) {
                ProgressView(value: progress)
                Text(printer.jobProgressMessage ?? printer.status.displayText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        } else if printer.status.isActive {
            VStack(spacing: 8) {
                ProgressView()
                Text(printer.jobProgressMessage ?? printer.status.displayText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
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

    @ViewBuilder private var actions: some View {
        HStack(spacing: 12) {
            Spacer(minLength: 0)
            if case .failed = printer.status {
                Button("Retry") { Task { await startPrint() } }
                    .buttonStyle(.borderedProminent)
            } else if printer.status == .done {
                Button("Print Again") { Task { await startPrint() } }
                Button("Done") { dismiss() }
                    .buttonStyle(.borderedProminent)
            } else if printer.savedPrinterID != nil, pngData != nil, !didStart, !printer.status.isActive {
                Button("Print") {
                    isConfirmingPrint = true
                }
                    .buttonStyle(.borderedProminent)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Flow

    private func begin() async {
        printer.resetStatus()
        guard let client = settingsStore.apiClient else {
            loadError = "Set a base URL in Manage."
            return
        }
        guard !settingsStore.requiresLogin else {
            loadError = "Log in from Manage to print."
            return
        }
        do {
            let data = try await client.fetchLabelImage(partID: partID, paperSize: printer.labelPaperSize)
            pngData = data
            labelImage = UIImage(data: data)
        } catch {
            loadError = settingsStore.handleAPIError(error)
            return
        }
    }

    private func startPrint() async {
        guard let data = pngData else { return }
        didStart = true
        try? await printer.print(pngData: data) // status reflects success/failure
    }
}
