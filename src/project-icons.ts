import type { IconName } from "@/components/ui/icon";

/**
 * The curated catalog behind the project-icon picker. Each category is a
 * recognisable identity, never chrome, VCS, brand or status decoration, so
 * the glyph cannot be mistaken for a sidebar affordance or a PR mark.
 */
export interface ProjectIconCategory {
  id: string;
  label: string;
  icons: readonly IconName[];
}

export const PROJECT_ICON_CATEGORIES: readonly ProjectIconCategory[] = [
  {
    id: "code",
    label: "Code & development",
    icons: [
      "Code", "CodeSimple", "CodeCircle", "CodeSquare", "CodeXml", "CodeFolder", "DocumentCode", "FileCode", "Terminal", "Command",
      "CommandLine", "Function", "FunctionSquare", "Algorithm", "Bug", "Binary", "BinaryCode", "Brackets", "Api", "McpServer",
      "Keyboard", "Mouse", "Laptop", "Monitor", "Cpu", "Robot", "OpenSource", "CircuitBoard",
    ],
  },
  {
    id: "infra",
    label: "Infrastructure & cloud",
    icons: [
      "Cloud", "CloudServer", "CloudCog", "CloudSync", "CloudBackup", "Database", "Server", "ServerCog", "Microchip", "Chip",
      "ComputerEthernet", "BluetoothConnected", "Wifi", "Router", "Antenna", "Satellite", "SatelliteDish", "Firewall", "Globe", "GlobeLock",
      "Battery", "BatteryCharging", "Power", "Blockchain",
    ],
  },
  {
    id: "office",
    label: "Office & documents",
    icons: [
      "File", "FileText", "FileAttachment", "FileQuestionMark", "FileAdd", "FileCheck", "FileEdit", "FileSearch", "FileArchive", "FileBox",
      "FilePen", "Folder", "FolderOpen", "FolderEdit", "FolderPlus", "FolderMinus", "Clipboard", "ClipboardList", "Notebook", "Book",
      "BookOpen", "BookText", "Books", "Bookshelf", "Archive", "Inbox", "Briefcase", "AddressBook",
    ],
  },
  {
    id: "data",
    label: "Data & analytics",
    icons: [
      "Analytics", "AnalyticsUp", "AnalyticsDown", "BarChart", "ChartLine", "ChartColumn", "ChartArea", "ChartBarBig", "ChartScatter", "ChartRadar",
      "ChartSpline", "PieChart", "DashboardCircle", "Gauge", "Percent", "Table",
    ],
  },
  {
    id: "design",
    label: "Design & media",
    icons: [
      "Palette", "Brush", "PaintBrush", "ColorPicker", "Image", "Camera", "CameraVideo", "Video", "Music", "AudioWaveform",
      "Mic", "Headphones", "Film", "Album", "Disc", "Artboard", "PenTool", "Pencil", "Ruler", "Crop",
      "Contrast", "Blur", "Canvas", "Clapperboard",
    ],
  },
  {
    id: "science",
    label: "Science & engineering",
    icons: [
      "Atom", "FlaskConical", "Beaker", "Microscope", "Telescope", "Dna", "Molecules", "Physics", "Calculator", "Gears",
      "Magnet", "Radiation", "Rocket", "Gravity", "Infinity", "Orbit", "Engine", "Hammer", "Wrench", "Asteroid",
      "NuclearPower", "Pickaxe",
    ],
  },
  {
    id: "nature",
    label: "Nature & places",
    icons: [
      "Tree", "Leaf", "LeafyGreen", "Flower", "Cactus", "PineTree", "Mountain", "Sun", "Moon", "Star",
      "Droplet", "Fire", "Flame", "Earth", "Map", "MapPin", "Location", "Home", "House", "Building",
      "City", "Beach", "Island", "Fish", "Bird", "Lighthouse",
    ],
  },
  {
    id: "people",
    label: "People & teams",
    icons: [
      "User", "Users", "UserGroup", "UserMultiple", "UserAdd", "UserCheck", "UserCircle", "UserList", "UserSquare", "Contact",
      "ContactRound", "Handshake", "TeamWork", "Profile", "Group", "PersonStanding",
    ],
  },
  {
    id: "commerce",
    label: "Commerce & finance",
    icons: [
      "ShoppingBag", "ShoppingCart", "ShoppingBasket", "Store", "Gift", "Tag", "Label", "Wallet", "Bank", "Receipt",
      "Invoice", "Discount", "DeliveryBox", "DeliveryTruck", "Cashier", "Coupon",
    ],
  },
  {
    id: "objects",
    label: "Objects & tools",
    icons: [
      "Toolbox", "ToolCase", "Drill", "Bulb", "Flashlight", "Anchor", "Key", "Pin", "Paperclip", "Scissors",
      "Umbrella", "Glasses", "Watch", "Clock", "Calendar", "Backpack", "Luggage", "Dice", "Puzzle", "Hourglass",
      "Lamp", "Lantern", "Balloon", "GameController",
    ],
  },
  {
    id: "comms",
    label: "Communication",
    icons: [
      "Mail", "MailOpen", "MessageSquare", "MessageCircle", "Chat", "Comment", "MessageQuestion", "Megaphone", "Sent", "Bell",
      "BellRing", "Notification",
    ],
  },
  {
    id: "status",
    label: "Status & priority",
    icons: [
      "Flag", "FlagTriangleRight", "Bookmark", "Heart", "Crown", "Medal", "Award", "Trophy", "Diamond", "Gem",
      "Sparkle", "Target", "Focus", "Goal",
    ],
  },
];

/** Every catalog glyph, flattened in category order. */
export const PROJECT_ICON_NAMES: readonly IconName[] =
  PROJECT_ICON_CATEGORIES.flatMap((category) => category.icons);

/** Set view of the catalog, for validating a stored glyph name. */
export const PROJECT_ICON_NAME_SET: ReadonlySet<string> = new Set(PROJECT_ICON_NAMES);
