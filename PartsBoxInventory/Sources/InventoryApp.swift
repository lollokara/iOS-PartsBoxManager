import SwiftUI

@main
struct InventoryApp: App {
    @StateObject private var settingsStore = SettingsStore()
    @StateObject private var printer = NiimbotPrinter()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(settingsStore)
                .environmentObject(printer)
        }
    }
}

