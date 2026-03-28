# Team 1 - Inventory Management App

This repository contains an in-progress inventory management web application built with React and Vite.

## Project Status (Done So Far)

### Completed foundation
- Frontend app bootstrapped with Vite + React.
- Client-side routing implemented with `react-router-dom`.
- Tailwind Vite plugin added to project setup.
- Core app shell and shared navigation/header implemented.

### Authentication and account flow
- Mock login flow is implemented with role-based users.
- Protected routes are in place (unauthenticated users are redirected to login).
- Account page is implemented with:
	- View signed-in username
	- Log out action
	- Change password navigation
- Change password page is implemented with:
	- Required-field checks
	- Password strength rules
	- New password confirmation/match checks
	- Success/error feedback states

### Role permissions
- Role permission model is implemented in `frontend/src/auth/permissions.js`.
- Roles currently mocked:
	- `admin`
	- `projectManager`
	- `warehouseManager`
	- `logisticsAssociate`
- Home page actions are filtered based on role permissions.

### Implemented pages and UX
- Login page
- Home dashboard with permission-gated action tiles
- Account page
- Change password page
- Inventory page with:
	- Search
	- Filters (project/category/status)
	- Summary cards
	- Item detail panel/modal
	- Permission-gated cost/actions in detail view
- Receive inventory page with:
	- Delivery and item entry forms
	- Validation + first-error scroll behavior
	- Add/remove item rows
	- Document upload/scan preview UI
- Request material page with:
	- Request metadata form
	- Multi-item request builder
	- Warehouse-based item selection
	- Quantity validation against available mock inventory

### Mock data available
- Mock users and roles
- Mock inventory dataset
- Mock request dataset (pending + fulfilled examples)

## In Progress / Not Yet Implemented

- Backend/API integration is not connected yet.
- Database persistence is not connected yet.
- Several action buttons are currently placeholders (alerts/UI only), such as:
	- Save Draft
	- Confirm Receipt
	- Submit Request
	- Adjust/Transfer/Create Shipment actions on inventory detail
- Manifest workflow file exists but is only scaffolded and not completed.
- Automated tests are not set up yet.

## Tech Stack

- React 19
- Vite
- React Router
- Motion
- Tailwind CSS (via Vite plugin)
- ESLint

## Local Development

From the `frontend` directory:

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Mock Login Accounts

Current demo credentials from the mock user file:

- Admin: username `admin`, password `admin`
- Project Manager: username `pm`, password `pm`
- Warehouse Manager: username `wm`, password `wm`
- Logistics Associate: username `la`, password `la`

## Project Structure

- `frontend/src/components`: page and UI components
- `frontend/src/auth`: mock users and role permissions
- `frontend/src/data`: mock inventory and request data

## Notes

This README reflects the current state of the ongoing class project and will be updated as backend integration and remaining workflows are completed.