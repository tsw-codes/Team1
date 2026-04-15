# Material Tracking and Inventory Management System

## Software Requirements Specification (SRS) — Version 2.0

**Date:** 04/14/26
**Team:** David Olatunji, Edmond Ndanji, Jonathan Smith, Oluwatomisin Sapara-Williams, Thomas Kratz

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [Business Rules](#3-business-rules)
4. [Functional Requirements](#4-functional-requirements)
5. [Use Cases](#5-use-cases)
6. [Data Requirements](#6-data-requirements)
7. [External Requirements](#7-external-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Reporting Requirements](#9-reporting-requirements)
10. [Supplemental Information](#10-supplemental-information)
11. [Change Management](#11-change-management)
12. [Glossary of Terms](#12-glossary-of-terms)
13. [Appendix](#13-appendix)

---

## 1. Introduction

### 1.1 Purpose

This document defines the software requirements for a mobile-first inventory and material tracking system developed for an HVAC/MEP construction company (MEC2). The system addresses the operational challenge of limited visibility into construction materials from delivery to final installation.

The application will be a **real, deployable product** designed to solve an active problem in day-to-day construction operations — not merely a demonstration or prototype.

### 1.2 Scope

This SRS covers Version 2.0 of a mobile-first web application for managing and tracking construction materials for HVAC/MEP operations.

**In scope for v2.0:**

- Delivery logging with photo capture of packing slips (including date/time records)
- Material quantity tracking across inventory
- Physical location tracking (warehouse, yard, jobsite)
- Material request submission for field crews
- Project manager dashboard for visibility and accountability

**Out of scope for v2.0** (possible future iterations):

- Automated OCR packing slip parsing
- Third-party procurement/accounting integrations
- Advanced reporting

### 1.3 Intended Audience

| Audience | Purpose |
|---|---|
| **Development Team** | Primary technical guide for design and implementation |
| **Project Management** (Dr. Samit Shivadekar) | Oversight, scope verification, evaluation |
| **Industry Stakeholder** (William Tikiob, MEC2) | Verify alignment with operational needs and business objectives |

### 1.4 Definitions

- **Pay Orders (PO):** A commercial document from a business to its suppliers detailing items and agreed prices for new products to add to on-hand inventory.
- **Project Manager:** An individual responsible for planning, executing, and closing projects by managing scope, budget, time, and resources.
- **Inventory Management System:** Software used to track, manage, and control the entire lifecycle of goods, from purchasing and storage to production and distribution.

### 1.5 References

- MEC2 website: https://m-corp.us/

---

## 2. Overall Description

### 2.1 Description

The Inventory Management System assists MEC2 with maintaining visibility of construction materials. It allows personnel to input arriving orders, reduces reorders and stockouts, increases productivity, and reduces misplaced material.

### 2.2 User Classes

| User Class | Description |
|---|---|
| **Logistics Associates** | Accept inventory at job sites, enter into system, verify packing slips match POs, manage site inventory. Permissions assigned by admins. |
| **Logistics Foremen** | All Logistics Associate permissions + create material/equipment requests, track requests from creation through completed transfer. |
| **Warehouse Managers** | Accept inventory at warehouse, enter into system, verify packing slips match POs, manage warehouse inventory. |
| **Project Managers** | Coordinate site activities, initiate POs, approve materials for jobs, coordinate warehouse-to-site inventory movement. |
| **System Administrators** | Create/activate/deactivate user accounts, assign user permissions. Most access of all groups. |

### 2.3 Operating Environment

- Mobile-first web interface accessible in major web browsers
- Optimized for mobile devices
- No native app installation required

### 2.4 Design and Implementation Constraints

- Must handle multiple concurrent users without performance degradation
- Must accurately represent inventory at job sites and warehouses
- Interface must appear professional with consistent color palette and aesthetic

### 2.5 Assumptions

- Inventory is updated by employees as it is used, shipped, and received
- Software will be used only by MEC2 employees
- Database will be periodically audited for accuracy

### 2.6 Dependencies

- SQLAlchemy for backend-database interface
- React for responsive, mobile-first web interface
- FastAPI for lightweight, high-performance REST API
- PostgreSQL for structured, relational database

---

## 3. Business Rules

| Rule ID | Rule Definition | Type | Impacted Req. |
|---|---|---|---|
| Login | Users must be able to enter credentials and authenticate | Constraint | 4.1.1 |
| View Inventory | Users must view inventory consistent with assigned permissions | Constraint | 4.1.2 |
| Receive Inventory | WMs and LAs must accept and enter new inventory | Implementation | 4.2.1 |
| Inventory Audit | WMs and LAs must audit site-specific inventory and make adjustments | Implementation | 4.2.2 |
| Inventory Transfer | LAs must transfer inventory to/from site/warehouse locations | Implementation | 4.2.3 |
| Transfer Manifest | Transfers must be manifested and tracked throughout | Constraint | 4.2.4 |
| Initiate Transfer | Logistics Foremen must initiate transfers between warehouse and sites | Implementation | 4.3.1 |
| Pay Orders | PMs must enter POs to be matched with packing slips | Implementation | 4.4.1 |
| Shipment Tracking | PMs and LFs must track shipment status at any point during transit | Implementation | 4.5.1 |
| User Management | Admin must create/update user accounts and permissions | Implementation | 4.6.1 |
| Location Management | Admin must create/update location information and status | Implementation | 4.6.2 |

---

## 4. Functional Requirements

### 4.1 All Users

- **4.1.1** Users can enter credentials and access the application
- **4.1.2** Users can view inventory information consistent with their access permissions

### 4.2 Warehouse Managers and Logistics Associates

- **4.2.1** Can accept and enter new inventory into the system
- **4.2.2** Can audit current site-specific inventory and make adjustments (includes Logistics Foremen)
- **4.2.3** Logistics Associates can transfer inventory to/from site/warehouse locations (includes Logistics Foremen)
- **4.2.4** Inventory transferred to/from locations is manifested and tracked

### 4.3 Logistics Foremen

- **4.3.1** Can initiate the transfer of inventory between warehousing and sites

### 4.4 Project Managers

- **4.4.1** Can enter Pay Orders into the system to be matched with Packing Slips

### 4.5 Project Managers and Logistics Foremen

- **4.5.1** Can track the status of a shipment

### 4.6 Admin

- **4.6.1** Can create and update user account information and permissions
- **4.6.2** Can create and update location information and status

### 4.7 Traceability Matrix

| Req. ID | Description | Use Case | Feature | Status |
|---|---|---|---|---|
| 4.1.1 | Users can login and authenticate | 1 | Login | Frontend UI complete, backend schemas complete |
| 4.1.2 | Users can view inventory per privileges | 2 | View Inventory | Frontend UI completed, tested with stub |
| 4.2.1 | Users can accept new inventory | 3 | Transfer Inventory | Frontend UI + database schemas |
| 4.2.2 | Users can audit current inventory | 4 | Manifest Inventory | Frontend logic/UI completed, tested with stub |
| 4.2.3 | Users can transfer inventory from location | 5 | Transfer Inventory | Frontend UI + database schemas |
| 4.2.4 | Transfers are manifested and tracked | 6 | Transfer/Manifest Inventory | Frontend UI + database schemas |
| 4.3.1 | Logistics Foreman can initiate transfer | 7 | Transfer Inventory | Frontend UI + database schemas |
| 4.4.1 | PMs enter Pay Orders to match Packing Slips | 8 | Receive Inventory | Frontend UI + database schemas |
| 4.5.1 | PMs and LFs can track shipment status | 9 | Manifest Inventory | Frontend UI + database schemas |
| 4.6.1 | Admin can manage user accounts/permissions | 10 | Administrator Tools | **Not yet implemented** |
| 4.6.2 | Admin can manage location info/status | 11 | Administrator Tools | **Not yet implemented** |

---

## 5. Use Cases

### Overview

The system has five primary actors: Logistics Associates, Logistics Foremen, Warehouse Managers, Project Managers, and Admin Staff.

- **Admin Staff** — manage user accounts and locations
- **Project Managers** — approve inventory, create Pay Orders, track shipments (alerted on shipment disposition changes)
- **Warehouse Managers** — receive/adjust inventory at warehouse, manifest requested inventory (alerted on Inventory Requisition acceptance)
- **Logistics Associates** — receive/adjust inventory at job sites, transfer manifested inventory between warehouses and job sites
- **Logistics Foremen** — all Logistics Associate responsibilities + request materials and track requests end-to-end

### 5.1 Use Case 1 — User Authentication

| Field | Value |
|---|---|
| **Requirement ID** | 4.1.1 |
| **Actors** | Admin, PM, WM, LA, LF |
| **Pre-conditions** | Application loaded in web browser |
| **Trigger** | User navigates to login page |
| **Post-conditions** | User authenticated, home screen loaded |
| **Primary Flow** | User enters credentials → System verifies and loads appropriate home screen content based on permissions |

### 5.2 Use Case 2 — Display Inventory

| Field | Value |
|---|---|
| **Requirement ID** | 4.1.2 |
| **Actors** | Admin, PM, WM, LA, LF |
| **Pre-conditions** | User logged in, home screen displayed |
| **Trigger** | User presses "View Inventory" |
| **Post-conditions** | Inventory displayed based on site/access permissions |
| **Primary Flow** | User presses inventory button → System checks permissions and displays appropriate information |

### 5.3 Use Case 3 — Receive Inventory

| Field | Value |
|---|---|
| **Requirement ID** | 4.2.1 |
| **Actors** | WM, LA, LF |
| **Secondary Actors** | Backend System |
| **Pre-conditions** | User logged in with appropriate permissions |
| **Trigger** | User navigates to receiving function and submits info |
| **Post-conditions** | New inventory added to site-specific location, PO matched to Packing Slip |
| **Primary Flow** | User submits receipt → System confirms, reflects new inventory, logs transaction |

### 5.4 Use Case 4 — Adjust Inventory (Discrepancies/Damages)

| Field | Value |
|---|---|
| **Requirement ID** | 4.2.2 |
| **Actors** | WM, LA, LF |
| **Pre-conditions** | User logged in with appropriate permissions |
| **Trigger** | User navigates to inventory audit function |
| **Post-conditions** | Inventory updated, movement added to log |
| **Primary Flow** | User updates inventory → System confirms, reflects changes, logs transaction |

### 5.5 Use Case 5 — Transfer Inventory

| Field | Value |
|---|---|
| **Requirement ID** | 4.2.3 |
| **Actors** | LA, LF |
| **Pre-conditions** | User logged in, manifested inventory exists in system |
| **Trigger** | User navigates to "Transfer Inventory" |
| **Post-conditions** | Inventory updated in staged and destination locations, movement logged |
| **Primary Flow** | User selects manifested inventory, verifies quantities, submits → System confirms |

### 5.6 Use Case 6 — Manifest Inventory and Prepare Shipment

| Field | Value |
|---|---|
| **Requirement ID** | 4.2.4 |
| **Actors** | WM, LA, LF |
| **Pre-conditions** | User logged in, approved inventory request exists |
| **Trigger** | User navigates to "Manifest Inventory" |
| **Post-conditions** | Inventory updated in source/staged locations, movement logged |
| **Primary Flow** | User selects inventory requisition, verifies quantities, submits → System confirms |

### 5.7 Use Case 7 — Request Inventory

| Field | Value |
|---|---|
| **Requirement ID** | 4.3.1 |
| **Actors** | LF |
| **Pre-conditions** | User logged in with appropriate permissions |
| **Trigger** | User navigates to "Request Inventory" |
| **Post-conditions** | Inventory requisition created and logged |
| **Primary Flow** | User enters requisition details, confirms, submits → System confirms with generated requisition number |

### 5.8 Use Case 8 — Create Shipment (Pay Order)

| Field | Value |
|---|---|
| **Requirement ID** | 4.4.1 |
| **Actors** | PM |
| **Secondary Actors** | Backend System |
| **Pre-conditions** | User logged in with appropriate permissions |
| **Trigger** | User navigates to "Submit Pay Order" |
| **Post-conditions** | Pay Order added to system and logged |
| **Primary Flow** | User enters PO details, confirms, submits → System confirms |

### 5.9 Use Case 9 — Track Shipment

| Field | Value |
|---|---|
| **Requirement ID** | 4.5.1 |
| **Actors** | PM, LF |
| **Secondary Actors** | Backend System (alerts) |
| **Pre-conditions** | User logged in with appropriate permissions |
| **Trigger** | User navigates to "Shipments" and selects Shipment ID |
| **Post-conditions** | Shipment status displayed |
| **Primary Flow** | User selects Shipment ID → System displays all tracking info. System also alerts user via email when shipment arrives. |

### 5.10 Use Case 10 — Manage Users

| Field | Value |
|---|---|
| **Requirement ID** | 4.6.1 |
| **Actors** | Admin |
| **Pre-conditions** | User logged in with admin permissions |
| **Trigger** | User navigates to "Manage Users" |
| **Post-conditions** | User information updated and saved to database |
| **Primary Flow** | Admin creates/updates user account with info and permissions → System confirms |

### 5.11 Use Case 11 — Manage Locations

| Field | Value |
|---|---|
| **Requirement ID** | 4.6.2 |
| **Actors** | Admin |
| **Pre-conditions** | User logged in with admin permissions |
| **Trigger** | User navigates to "Manage Locations" |
| **Post-conditions** | Location information updated and saved to database |
| **Primary Flow** | Admin creates/updates location with info and status → System confirms |

---

## 6. Data Requirements

### 6.1 Logical Data Models

*(ER Diagram and Entity Ownership Diagram exist in the original PDF)*

### 6.2 Data Dictionary

#### Inventory Table

| Attribute | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | STRING | Yes | — | Primary Key |
| name | VARCHAR(20) | Yes | — | Display name |
| sku | VARCHAR(10) | Yes | 0 | Stock keeping unit |
| unit | VARCHAR(10) | Yes | 0 | What one unit is |
| category | VARCHAR(30) | Yes | 0 | Category |
| unitCost | NUMERIC(12,2) | Yes | — | Cost per unit |

#### Location Table

| Attribute | Type | Required | Default | Notes |
|---|---|---|---|---|
| name | VARCHAR(20) | Yes | Null | Primary Key |

#### Project Table

| Attribute | Type | Required | Default | Notes |
|---|---|---|---|---|
| name | VARCHAR(20) | Yes | — | Primary Key |
| location | VARCHAR(20) | Yes | False | PK, FK → Location |

#### Stored Table (Inventory at Locations)

| Attribute | Type | Required | Default | Notes |
|---|---|---|---|---|
| loc_name | VARCHAR(20) | Yes | — | PK, FK → Location |
| inv_id | INTEGER | Yes | — | PK, FK → Inventory |
| quantity | INTEGER | Yes | 1 | Units stored |
| updatedAt | DATE | Yes | Current Date | Last changed |
| status | INT | Yes | — | Status code |
| project | VARCHAR(20) | No | NULL | Associated project |

#### Request Table

| Attribute | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | VARCHAR(10) | Yes | — | Primary Key |
| status | INT | Yes | — | Request status |
| project | VARCHAR(20) | No | — | Associated project |
| requested_by | INT | Yes | — | FK → Users |
| neededByDate | DATE | Yes | — | Date needed |
| priority | INT | Yes | Low | High/Medium/Low |
| delivery_loc | VARCHAR(20) | Yes | — | FK → Location |
| notes | TEXT | No | Null | User notes |

#### Request Item Table

| Attribute | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | INT | Yes | — | PK, FK → Inventory |
| request | VARCHAR(10) | Yes | — | PK, FK → Request |
| quantity | INT | Yes | 1 | Quantity needed |

#### Users Table

| Attribute | Type | Required | Default | Notes |
|---|---|---|---|---|
| id | INT | Yes | — | Primary Key |
| user_name | VARCHAR(35) | Yes | — | Unique, for auth |
| name | VARCHAR(35) | Yes | — | Display name |
| password | VARCHAR(35) | Yes | — | For auth |
| email | VARCHAR(35) | Yes | — | Company email for notifications |
| role | VARCHAR(20) | Yes | — | User role |

### 6.3 Data Maintenance

- Inventory data stored until edited by a user
- User data stored until edited by an admin
- Log data stored for a specified period, then auto-deleted

---

## 7. External Requirements

### 7.1 User Interface

- **7.1.1** Login screen for credential entry
- **7.1.2** Inventory display based on user role/permissions
- **7.1.3** Interfaces for entering, adjusting, and transferring inventory (dashboards)
- **7.1.4** Interface for PMs to enter Pay Orders and track shipments
- **7.1.5** Admin interface for managing user accounts

### 7.2 Software Interfaces

- **7.2.1** Role-based access enforcement
- **7.2.2** Inventory records and transfers saved to/retrieved from database
- **7.2.3** All inventory records generate a trackable list

### 7.3 Communication Interfaces

- **7.3.1** Notify users of shipment and transfer status updates
- **7.3.2** Admin location changes reflected system-wide

---

## 8. Non-Functional Requirements

### 8.1 Availability

- Available during standard construction hours (6:00 AM – 6:00 PM local, 7 days/week)
- Target minimum 99% uptime during working hours
- Planned maintenance scheduled outside working hours

### 8.2 Compatibility

- Modern browsers: Chrome, Safari, Firefox (mobile + desktop)
- Optimized for iOS and Android mobile devices
- No native app required
- Support screen sizes from smartphones to desktop monitors

### 8.3 Reliability

- Graceful handling of failed network requests with appropriate error messages
- No data loss on network interruption for user-submitted data
- Regular automated database backups
- Input validation to prevent corrupt/incomplete data

### 8.4 Scalability

- Accommodate growth in users, projects, and inventory records
- Database schema supports future addition of warehouse bins/sub-locations
- Backend allows horizontal scaling as MEC2 expands

### 8.5 Localization

- English as primary language
- Date format: MM/DD/YYYY, local time zone
- Currency: US Dollars

---

## 9. Reporting Requirements

- **9.1** Software Requirements Specification report with headers (title, team, date range), page numbers, and table of contents

---

## 10. Supplemental Information

### 10.1 Frontend

- React + Vite for fast development and optimized builds
- Tailwind CSS for lightweight, mobile-optimized UI
- React Router for client-side navigation
- React Query for data fetching, caching, and sync
- Deployed via Netlify (free tier) with continuous deployment

### 10.2 Backend

- Python + FastAPI for high-performance REST API
- SQLAlchemy ORM for PostgreSQL interaction
- Alembic for database migrations
- Pydantic for data validation/serialization
- Celery + Redis for async background tasks (email notifications, automated updates)
- Development: Railway (free tier) → Production: AWS EC2

### 10.3 Database and Background Services

- PostgreSQL for structured relational data storage
- Stores: projects, materials, deliveries, inventory levels, locations, user accounts
- Celery + Redis for background task processing

### 10.4 File Storage

- Cloudinary for external file storage (packing slips, delivery photos)
- Files stored externally, referenced in DB via URL and metadata

### 10.5 Authentication and Authorization

- JWT + refresh tokens for secure, persistent sessions
- Role-based access control (RBAC) with four roles: Admin, PM, WM, LA
- Each role has specific permissions

### 10.6 Coding Practices

- Clear, readable code with descriptive names
- Logical parameter ordering
- Concise function documentation
- Related functions grouped by functionality
- Consistent formatting across the project

---

## 11. Change Management

### 11.1 Added Features

- **11.1.1** New user class: Logistics Foreman — responsible for tracking and requesting inventory (previously thought to be LA responsibility)

### 11.2 Deprecated Features

- **11.2.1** Automated packing slip entry with Amazon OCR — out of scope for now

### 11.3 Modified Features

- None

---

## 12. Glossary of Terms

| Term | Definition |
|---|---|
| **MEC2** | Mechanical Engineering and Construction Corporation, the primary industry stakeholder |
| **Stakeholder** | Individual/group with interest in the project outcome (William Tikiob, Prof. Shivadekar, dev team) |
| **Inventory** | Construction materials and supplies tracked in the system (quantity, size, price, location) |
| **Packing Slip** | Document accompanying deliveries listing contents and quantities, verified against Pay Orders |
| **Pay Order (PO)** | Purchase order entered by PM, matched against incoming packing slips to confirm received materials |
| **Inventory Requisition** | Formal request by PM to initiate inventory transfer from warehouse to job site |
| **Manifest** | Document by WM itemizing inventory being prepared for transfer between warehouse and job site |
| **Project Manager** | User responsible for coordinating site activities, POs, approving requests, tracking shipments |
| **Warehouse Manager** | User responsible for receiving/managing warehouse inventory and manifesting requested inventory |
| **Logistics Associate** | Field user responsible for receiving at job sites, auditing inventory, transferring manifested inventory |

---

## 13. Appendix

- GitHub Repository: https://github.com/tsw-codes/Team1
- MEC2 Website: https://m-corp.us/
