# Hosila Property Management System - Complete Feature Guide

## Overview and Purpose
Hosila is a comprehensive, all-in-one **Hotel Property Management System (PMS)** built for independent boutique hotels and enterprise hospitality groups in Africa (from 5 to 60+ rooms).

It operates as a progressive web app (PWA) with native-like desktop and mobile capabilities, designed to digitize every aspect of hotel operations. By centralizing front-desk operations, back-office accounting, restaurant sales, and guest communications into one unified platform, Hosila eliminates the need for manual ledgers, disconnected retail POS systems, and scattered spreadsheets.

---

## Core Operational Features by Department

### 1. Front Desk & Room Management (The Operations Hub)
The Front Desk module is the nerve center of the hotel, designed for rapid guest processing and real-time room status visibility.
*   **Interactive Room Grid:** A color-coded, floor-based calendar grid showing real-time statuses (Available, Occupied, Dirty, Maintenance, Short Rest).
*   **Check-In/Check-Out Wizard:** Streamlined flows to process arrivals and departures, including digital ID photo capture and digital registration cards.
*   **Reservation Management:** Calendar and list views for upcoming stays. Staff can manually book reservations, take advance deposits, and convert them to live bookings upon arrival.
*   **Guest Lifecycle Actions:** Quick actions to extend stays, process early check-outs, or mark rooms as clean/dirty.

### 2. Guest Relations & CRM
Hosila builds a permanent system of record for every guest who walks through the doors.
*   **Rich Guest Profiles:** Automatically compiles stay history, contact information, ID documents, and total lifetime spend.
*   **Guest Ledger:** A dedicated, transparent folio for every active booking showing a chronological list of all charges (room, restaurant, laundry) and payments made. Invoices and receipts can be instantly generated and printed/emailed from this ledger.

### 3. Automated Guest Communications (Email Engine)
Hosila acts as a 24/7 digital concierge, automatically communicating with guests at key touchpoints without staff intervention.
*   **Reservation Confirmations:** Sent instantly when a stay is booked.
*   **Check-In Welcome Emails:** Automated messages welcoming the guest to the property with customized instructions or promotional offers.
*   **Check-Out Receipts:** Digital folios and thank-you notes emailed automatically upon departure.
*   **Custom Templates:** Management can customize the branding, colors, promotional banners, and footers of all automated emails.

### 4. Restaurant & Bar Point-of-Sale (POS)
A built-in retail system specifically designed for hospitality, completely linked to the hotel's room inventory.
*   **Digital Menu & Cart:** A touch-friendly interface for waitstaff to browse categories, add items to a cart, and manage quantities.
*   **Charge-to-Room Routing:** Instead of paying at the table, guests can seamlessly charge restaurant and bar bills directly to their room folio, to be settled at checkout.
*   **Direct Payments:** Support for immediate cash, transfer, or POS terminal payments for walk-in customers or guests paying upfront.
*   **Order History & Kitchen Tracking:** Live tracking of order statuses.

### 5. Inventory & Procurement
Protects the hotel's bottom line by tracking physical assets and consumables.
*   **Stock Tracking:** Categorized tracking for Food, Beverages, Housekeeping, Laundry, and Maintenance supplies.
*   **Movement Reports:** Detailed logs of all inventory changes, categorizing whether items were used, wasted, or restocked.
*   **Low-Stock Alerts:** Automated alerts when critical items fall below acceptable thresholds.

### 6. Accounting, Finance & KPI Dashboards
Enterprise-grade financial controls that keep the books perfectly balanced.
*   **Executive Dashboard:** Real-time visibility into today's Revenue, Occupancy %, Average Daily Rate (ADR), and Revenue Per Available Room (RevPAR), alongside visual activity charts.
*   **Strict Double-Entry Ledger:** Invisible to the user, the system automatically records every action as a balanced double-entry journal (e.g., crediting Room Revenue while debiting Guest Accounts Receivable to prevent fraud).
*   **FIFO Payment Allocation:** When a guest pays a lump sum at checkout, the system uses algorithmic First-In, First-Out logic to accurately apply the payment to individual charges (like room taxes vs. food).
*   **Expense & Income Logging:** Dedicated hubs to track operational expenses (salaries, fuel) and miscellaneous "Other Income" (venue hire, laundry).
*   **Advanced Tax Engine:** A highly configurable compliance module that automatically calculates Service Charge (SC), Value Added Tax (VAT), and Tourism Development Levy (TDL) per department. It features automated Remittance tracking so accountants know exactly what is owed to the government.

### 7. PWA, Offline & Cloud Capabilities
*   **Offline Resilience:** As a Progressive Web App, the system caches data locally. If the hotel loses internet connection, staff can continue to view critical information.
*   **Real-time Cloud Sync:** The moment the internet returns, or when another terminal makes an update, all devices (reception desktop, restaurant tablet) sync instantly via WebSocket connections.
*   **Multi-Role Access Control:** Strict permissions ensuring that front desk agents cannot view financial reports, and restaurant staff cannot modify room rates.

---

## Technical Integrations for Developers

While Hosila is a complete standalone product, it offers specific APIs and hooks for external developers to build powerful extensions.

### 1. Website Hooking (Direct Booking Integration)
Hotels can connect their external, custom-built marketing websites directly to the Hosila platform via API to accept commission-free bookings.
*   **Live Availability Checks:** When a prospective guest selects dates on the hotel's custom website, the website must query the `Hosila Backend API` to perform a real-time availability check against the live database.
*   **Direct Booking Injection:** If rooms are available, the guest completes the booking on the external website. The website then sends a secured `POST` payload to push the reservation data (guest details, dates, room type) directly into the PMS.
*   **Instant Sync:** Upon successful submission, Hosila instantly blocks out the physical inventory, preventing double-booking and immediately updating the front desk's calendar. Developers must ensure they handle availability race conditions before confirming the booking to the guest.

### 2. AI-Powered OTA Email Parsing (Automated Import)
Hosila features a smart email parser that eliminates manual data entry from Online Travel Agencies (OTAs) like Booking.com and Airbnb.
*   **Setup Requirement:** The hotel **must have a dedicated, designated email address** (e.g., `reservations@hotelname.com`) that they use exclusively for receiving OTA confirmation emails. 
*   **How it Works:** Hosila hooks directly into this inbox. When a new confirmation email arrives, the backend AI parsing engine reads the unstructured email, extracts the guest's name, stay dates, and pricing details, and injects a pending Reservation directly into the PMS for staff approval.
