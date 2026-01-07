# ezhalha Logistics Platform - Design Guidelines

## Design Approach
**Reference-Based**: Drawing inspiration from modern B2B SaaS platforms like Shippo, Linear, and Stripe Dashboard. Enterprise logistics platform requiring clarity, trust, and efficiency.

## Core Design Philosophy
Professional, data-dense interface prioritizing clarity and rapid task completion. Clean, modern aesthetic that builds trust while maintaining high information density.

## Brand Integration
- **Brand Color**: #fe5200 (vibrant orange) - use for primary CTAs, active states, and brand accents
- **Logo**: PNG logo at `/assets/branding/logo.png` - display prominently in navigation header

## Typography System
- **Primary Font**: Inter (Google Fonts) - excellent for data-heavy interfaces
- **Hierarchy**:
  - H1: text-4xl font-bold (page titles)
  - H2: text-2xl font-semibold (section headers)
  - H3: text-xl font-semibold (card headers)
  - Body: text-base (primary content)
  - Small: text-sm (labels, metadata)
  - Tiny: text-xs (timestamps, secondary info)

## Layout System
- **Spacing Units**: Tailwind 2, 4, 6, 8, 12, 16 (p-4, mt-8, gap-6, etc.)
- **Container**: max-w-7xl for main content areas
- **Dual Portal Structure**:
  - **Admin Portal**: Sidebar navigation (w-64) with collapsible sections
  - **Client Portal**: Top navigation bar with horizontal menu

## Component Library

### Navigation
**Admin Sidebar**:
- Fixed left sidebar, full height
- Logo at top (h-16 flex items-center px-6)
- Navigation groups with collapsible sections
- Active state: border-l-4 with brand color + subtle background
- Icons from Heroicons (outline for inactive, solid for active)

**Client Header**:
- Horizontal nav bar (h-16)
- Logo left, navigation center, user menu right
- Sticky positioning for constant access

### Dashboard Components
**Stat Cards**: Grid layout (grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6)
- Card structure: p-6, rounded-lg border
- Large number display (text-3xl font-bold)
- Label below (text-sm)
- Optional trend indicator with small arrow icon

**Data Tables**:
- Zebra striping for row differentiation
- Sticky headers during scroll
- Row height: px-6 py-4
- Action buttons: icon-only for space efficiency
- Pagination below table
- Filters above table in compact toolbar

### Forms
**Input Fields**:
- Height: h-11
- Padding: px-4
- Border: border rounded-lg
- Labels: text-sm font-medium mb-2
- Error states: border-red-500 + text-red-600 message below
- Helper text: text-sm text-gray-600 mt-1

**Buttons**:
- Primary (brand color): h-11 px-6 rounded-lg font-medium
- Secondary: border-2 h-11 px-6 rounded-lg
- Icon buttons: h-11 w-11 rounded-lg (for table actions)
- Loading states: spinner icon + disabled styling

### Status Indicators
**Shipment Statuses**: Badge components with semantic colors
- Processing: yellow/amber background
- In Transit: blue background  
- Delivered: green background
- Cancelled: red background
- Badge style: px-3 py-1 rounded-full text-xs font-semibold

### Client Application Flow
**Application Form Page**:
- Centered card layout (max-w-2xl mx-auto)
- Multi-step form with progress indicator at top
- Clear field groupings with section headers
- Submit button: prominent, full-width at bottom

### Modals & Overlays
- Modal backdrop: semi-transparent overlay
- Modal container: max-w-2xl, centered, p-8
- Header with title and close button
- Footer with action buttons (right-aligned)

## Page-Specific Layouts

### Admin Dashboard
- Stat cards row at top
- Charts/graphs section (grid-cols-1 lg:grid-cols-2)
- Recent activity table below
- Quick actions sidebar (w-80, right side)

### Client Dashboard  
- Profile tier badge prominently displayed
- Shipment summary cards
- Quick create shipment CTA
- Recent shipments table

### Shipment Management
- Filter toolbar at top (flex layout with search, dropdowns, date range)
- Data table with pagination
- Bulk action bar appears when items selected
- Shipment detail: slide-over panel from right (w-96)

### Invoice & Payment Pages
- Invoice list: table with download buttons
- Invoice detail: structured layout mimicking physical invoice
- Payment history: timeline-style layout showing transaction flow

## Images
No hero images required. This is a utility-focused application. Use icons throughout for visual hierarchy and quick recognition.

## Animations
**Minimal, purposeful only**:
- Sidebar collapse/expand transition
- Modal fade in/out
- Loading spinners
- Toast notifications slide-in from top-right

## Accessibility
- High contrast ratios for all text
- Keyboard navigation for all interactive elements
- Focus states: 2px ring in brand color
- Screen reader labels for icon-only buttons
- Proper heading hierarchy maintained