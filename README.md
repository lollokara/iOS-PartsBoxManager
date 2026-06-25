<h1 align="center">P A R T S B O X &nbsp; M A N A G E R</h1>

<p align="center">
  <strong>Offline-friendly library browser backend and native SwiftUI iOS app for electronics inventory.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-AGPL--3.0-0d1117?style=flat-square&labelColor=161b22" alt="License"/>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20iOS%20%7C%20Linux-0d1117?style=flat-square&labelColor=161b22" alt="Platform"/>
  <img src="https://img.shields.io/badge/backend-Node.js%20%C2%B7%20Fastify-0d1117?style=flat-square&labelColor=161b22&color=3c873a" alt="Backend"/>
  <img src="https://img.shields.io/badge/frontend-TypeScript%20%C2%B7%20esbuild-0d1117?style=flat-square&labelColor=161b22&color=2d7ddb" alt="Frontend"/>
  <img src="https://img.shields.io/badge/iOS-SwiftUI%20%C2%B7%20CoreBluetooth-0d1117?style=flat-square&labelColor=161b22&color=f05138" alt="iOS App"/>
  <img src="https://img.shields.io/badge/mDNS-Bonjour-0d1117?style=flat-square&labelColor=161b22&color=e76f51" alt="Bonjour"/>
</p>

<br/>

> PartsBox Manager is an open-source electronics inventory helper suite designed to optimize your workbench workflow. It syncs your component inventory from **PartsBox** (the online inventory manager) to a self-hosted, offline-friendly Node.js backend server, and pairs with a native SwiftUI iOS application for workbench inventory management, barcode scanning, and direct Bluetooth thermal label printing.

<br/>

## Core Components

The ecosystem consists of:

*   **Passive Library Browser (NPM Backend)**: A self-hosted Node.js server and lightweight web application synced from PartsBox, optimized for browsing resistors, capacitors, and inductors sorted by value.
*   **SwiftUI iOS App**: A native mobile client for quick inventory lookups, stock level updates, barcode scanning, and direct label printing to Bluetooth-enabled NIIMBOT printers.

<br/>

## iOS App Interface

<table width="100%">
  <tr>
    <td align="center" width="50%">
      <img src="SCREENS/Screenshot%202026-06-26%20%2800.01.05%29.png" alt="Library Categories" width="340"/>
      <br/><sub><b>Categories</b> &mdash; Value-sorted browsing of resistors, capacitors, and inductors</sub>
    </td>
    <td align="center" width="50%">
      <img src="SCREENS/Screenshot%202026-06-26%20%2800.01.34%29.png" alt="Scan & Search" width="340"/>
      <br/><sub><b>Barcode Scanner</b> &mdash; Live camera scanning and component recognition</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="SCREENS/Screenshot%202026-06-26%20%2800.01.48%29.png" alt="Stock Mutations & Printing" width="340"/>
      <br/><sub><b>Inventory Stock & Printing</b> &mdash; Stock mutation forms and direct Bluetooth print controls</sub>
    </td>
    <td align="center" width="50%">
      <img src="SCREENS/Screenshot%202026-06-26%20%2800.02.01%29.png" alt="Settings & Connections" width="340"/>
      <br/><sub><b>Settings & Discovery</b> &mdash; Bonjour autodetect and printer configuration</sub>
    </td>
  </tr>
</table>

<br/>

## Key Features

*   **Direct Bluetooth Printing**: The app contains native Swift drivers that connect directly to NIIMBOT thermal printers (B1, B21, D11, D110, etc.) over Bluetooth. You can print part labels and storage bin labels directly from the app without any intermediate print server.
*   **Component Barcode Scanning**: Use your iPhone's camera to scan manufacturer barcodes and QR codes on bags, reels, and boxes. The app automatically parses Manufacturer Part Numbers (MPNs), manufacturer names, lot codes, and package quantities.
*   **DigiKey & Nexar Enrichment**: Instantly cross-reference scanned parts with the DigiKey Developer API or Nexar API to fetch official product specifications, footprints, and manufacturer datasheet links.
*   **Quick Stock Mutations**: Add or deduct inventory stock ("Stock In" / "Stock Out") at your desk, which instantly pushes updates back to PartsBox.
*   **Storage Location Management**: Browse your storage bins and locations, inspect the components stored in each, reassign parts to new bins, and print high-resolution QR codes to label your physical drawers.
*   **Auto-Discovery (Bonjour)**: Zero configuration required. The app automatically discovers the local server on your Wi-Fi network using Bonjour service discovery.

<br/>

## External API Keys Setup

To enable inventory syncing and component spec enrichment, PartsBox Manager connects to the PartsBox API and DigiKey API. Both services offer tiers that are completely free for personal use.

### 1. PartsBox API Key
PartsBox provides an API to interface other applications with your inventory database.
1. Sign in to your account on [PartsBox](https://partsbox.com).
2. Go to **Settings** -> **API Keys**.
3. Click **Generate New API Key**.
4. Copy the API key and paste it into your `.env` file as `PARTSBOX_API_KEY`.

### 2. DigiKey Developer API
DigiKey's API is used to enrich scanned barcodes or part numbers with official product descriptions, categories, and parameters.
1. Visit the [DigiKey Developer Portal](https://developer.digikey.com/) and register a free developer account.
2. Go to **My Organizations** and create an organization (e.g., "Personal Lab").
3. Go to **Production Apps** and click **Add Application**.
4. Enter an application name and description.
5. In the **OAuth Redirect URI** field, enter `https://localhost` (this application handles OAuth exchanges locally).
6. Under **API Groups**, subscribe to the **Product Information** API (which is free).
7. Once the app is created, copy the **Client ID** and **Client Secret** and add them to your `.env` as `DIGIKEY_CLIENT_ID` and `DIGIKEY_CLIENT_SECRET`.

<br/>

## Quick Start

### 1. Local Server Setup
Clone the repository and install the dependencies:
```bash
npm install
```

Create your `.env` file based on the template:
```bash
cp .env.example .env
```
Edit the `.env` file and insert your `PARTSBOX_API_KEY` (along with the optional DigiKey credentials).

Build the React/TypeScript web client:
```bash
npm run build:web
```

Start the mobile-ready backend server:
```bash
npm run start:mobile
```
*Note: Keep this terminal window open. It will automatically compile, run the server, and output the local LAN URLs.*

### 2. Run the iOS App
1. Open the SwiftUI project folder `PartsBoxInventory` in Xcode.
2. Select your connected iPhone or simulator, choose the `PartsBoxInventory` scheme, and click **Run**.
3. Join the same Wi-Fi network as your server, navigate to **Manage** in the iOS App, and tap **Discover on Casa** to pair automatically.

<br/>

## Repository Structure

```
PartsBox-Manager/
├── PartsBoxInventory/       Native SwiftUI iOS application project
│   ├── Sources/             Swift source files (app views, BLE printer driver, models)
│   └── Assets.xcassets/     App icon & assets
│
├── src/                     Fastify-based Node.js backend server
│   ├── api/                 Fastify endpoint routers (mobile, library, auth)
│   ├── cache/               Local inventory json cache controllers
│   ├── digikey/             DigiKey OAuth2 & search enrichment client
│   ├── nexar/               Nexar API enrichment client
│   ├── parser/              MPN and component description parsers
│   └── sync/                Sync queue, history, and PartsBox API synchronization services
│
├── web/                     Frontend Single Page Application (vanilla CSS + TypeScript)
│
├── docs/                    Comprehensive documentation and API references
│   ├── DEPLOYMENT.md        Server installation, systemd, and reverse proxy guidelines
│   └── API_Reference.md     PartsBox REST API specifications
│
├── deploy/                  systemd daemon configuration templates
├── scripts/                 Reset utilities and mobile-ready server startup runners
└── tests/                   Vitest test suite (unit, integration, mock api servers)
```

<br/>

## Deployment Guide

For full server setup guides, Linux systemd configuration templates, reverse proxy setups (Nginx/Caddy) with HTTPS, and security configurations, please refer to the detailed [Deployment Guide](docs/DEPLOYMENT.md).

<br/>

## Credits & Acknowledgements

The iOS printing driver is built upon the reverse-engineering work and codebase of the **NIIMBLUE** project:
*   **[@mmote/niimbluelib](https://github.com/mmote/niimbluelib)**: The core printer packet builders and protocol.

We are extremely grateful to **mmote** and the contributors of the NIIMBLUE ecosystem for decoding the proprietary Bluetooth protocols of NIIMBOT thermal printers, enabling our native iOS client to control them directly.

<br/>

## License

This project is licensed under the **GNU Affero General Public License v3 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for the full license text.
