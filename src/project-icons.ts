import type { IconName } from "@/components/ui/icon";

/**
 * The curated catalog behind the project-icon picker: recognisable identities
 * only, never chrome, VCS, brand or status decoration, so a glyph cannot be
 * mistaken for a sidebar affordance or a PR mark.
 */
export interface ProjectIconCategory {
  id: string;
  label: string;
  icons: readonly IconName[];
}

export const PROJECT_ICON_CATEGORIES: readonly ProjectIconCategory[] = [
  {
    id: "ai",
    label: "AI & machine learning",
    icons: [
      "Brain", "BrainCircuit", "BrainCog", "Bot", "ChatBot", "Robot", "Robotic", "MachineRobot", "Chip", "Microchip", "CircuitBoard", "Cpu",
      "CpuCharge", "NeuralNetwork", "Algorithm", "OnlineLearning",
    ],
  },
  {
    id: "code",
    label: "Code & development",
    icons: [
      "Code", "Terminal", "Command", "CommandLine", "Console", "Shell", "Bash", "ComputerTerminal", "FileTerminal", "SquareTerminal", "VideoConsole", "Api",
      "Bug", "Binary", "Brackets", "Keyboard", "Laptop", "Monitor", "McpServer", "OpenSource", "DocumentCode", "FileCode", "FileScript", "CodeSimple",
      "CodeCircle", "CodeSquare", "CodeXml", "CodeFolder", "Function", "BinaryCode", "QrCode", "BarCode", "Browser", "PinCode", "SmsCode", "Leetcode",
      "Software", "Developer", "FileInput", "InputText", "NonBinary", "WebDesign", "ApiGateway", "ArcBrowser", "FileOutput", "FolderCode", "JavaScript", "QrCodeScan",
      "FolderInput", "InspectCode", "SolarSystem", "AppWindowMac", "CProgramming", "FolderOutput", "InputNumeric", "SystemUpdate", "InputLongText", "FileCodeCorner", "InputShortText", "InputCursorText",
      "SourceCodeCircle", "SourceCodeSquare",
    ],
  },
  {
    id: "security",
    label: "Security & access",
    icons: [
      "Security", "Shield", "Lock", "Key", "FaceId", "Safe", "Vault", "Gavel", "Legal", "Cctv", "Eye", "ShieldUser",
      "ShieldCog", "Firewall", "Judge", "Siren", "Access", "Locked", "BookKey", "Encrypt", "FileKey", "License", "LockKey", "SafeBox",
      "ScanEye", "UserKey", "BookLock", "ChatLock", "CourtLaw", "DoorLock", "FileLock", "KeyRound", "LockOpen", "LockSync", "MailLock", "UserLock",
      "WifiLock", "EarthLock", "EyeClosed", "FolderKey", "GlobeLock", "Incognito", "KeySquare", "LicenseNo", "PhoneLock", "PoliceCap", "RssLocked", "ShieldBan",
      "ShieldKey", "CallLocked", "CctvCamera",
    ],
  },
  {
    id: "infra",
    label: "Infrastructure & cloud",
    icons: [
      "Cloud", "CloudServer", "CloudCog", "CloudBackup", "Server", "ServerCog", "Database", "Network", "Wifi", "Router", "Antenna", "Satellite",
      "SatelliteDish", "Globe", "Battery", "BatteryCharging", "Power", "Blockchain", "HardDrive", "MemoryStick", "RamMemory", "Usb", "Plug", "CloudSync",
      "Fan", "Cable", "Drive", "Signal", "PlugZap", "UsbBugs", "WifiCog", "WifiLow", "WifiPen", "CableCar", "CloudFog", "EcoPower",
      "HomeWifi", "SignalNo", "SunCloud", "WifiHigh", "WifiSync", "WifiZero", "Bluetooth", "GpsSignal", "UsbMemory", "WindPower", "BatteryLow", "FloppyDisk",
      "FolderSync", "FullSignal", "HydroPower",
    ],
  },
  {
    id: "data",
    label: "Data & analytics",
    icons: [
      "Analytics", "AnalyticsUp", "AnalyticsDown", "ChartColumn", "ChartLine", "ChartArea", "PieChart", "DashboardCircle", "Gauge", "Percent", "Table", "Abacus",
      "ChartScatter", "ChartRadar", "ChartSpline", "ChartBubble", "ChartGantt", "ChartRose", "Flowchart", "Pie", "Chart", "Radar", "Scale", "Funnel",
      "Spline", "ChartUp", "BarChart", "ChartDown", "ChartRing", "GridTable", "PoolTable", "TableLamp", "TableRound", "ChartBarBig", "ChartCandle", "ChartMedium",
      "CircleGauge", "DiningTable", "LayoutTable", "ScaleThreeD", "WeightScale", "BalanceScale", "ChartAverage", "ChartBarLine", "ChartHighLow", "ChartMaximum", "ChartMinimum", "ChartNetwork",
      "DataRecovery", "ChartAnalysis", "ChartDecrease",
    ],
  },
  {
    id: "photo",
    label: "Photography & video",
    icons: [
      "Camera", "CameraVideo", "CameraLens", "CameraTripod", "Video", "Film", "Clapperboard", "Aperture", "Album", "Drone", "Image", "PictureInPicture",
      "ImageUp", "VideoAi", "CameraAi", "FilmRoll", "BookImage", "DiscAlbum", "ImageCrop", "ImageDone", "ImageDown", "ImagePlay", "ScanImage", "LensConvex",
      "CameraSmile", "FolderVideo", "ImageDelete", "LaptopVideo", "LensConcave", "TextToImage", "VideoReplay", "ImageToVideo", "ImageUpscale", "SwitchCamera", "CameraRotated", "ComputerVideo",
      "VideoCameraAi", "InsertTopImage", "CameraNightMode", "GalleryVertical", "ImageActualSize", "CameraMicrophone", "ImageComposition", "ComputerVideoCall", "GalleryHorizontal", "GalleryThumbnails", "ImageFlipVertical", "InsertBottomImage",
      "GalleryVerticalEnd", "PictureInPictureOn", "CameraAutomatically",
    ],
  },
  {
    id: "music",
    label: "Music & audio",
    icons: [
      "Music", "MusicNote", "AudioWaveform", "Mic", "Speaker", "Headphones", "Headset", "Radio", "Disc", "Guitar", "Drum", "Volume",
      "Podcast", "Turntable", "Playlist", "AudioLines", "AudioWave", "RadioTower", "MicVocal", "Voice", "BoomBox", "DiscTwo", "VoiceId", "VolumeUp",
      "AudioBook", "DiscThree", "MailVoice", "VolumeLow", "MusicThree", "VolumeHigh", "CassetteTape", "VoiceComment", "RadioReceiver", "MonitorSpeaker", "MusicNoteSquare", "HeadsetConnected",
    ],
  },
  {
    id: "food",
    label: "Food & drink",
    icons: [
      "Restaurant", "Coffee", "Pizza", "Cake", "IceCream", "Chef", "Spoon", "Plate", "Donut", "Cookie", "Candy", "Egg",
      "Tea", "Beer", "Cafe", "Corn", "Milk", "Bread", "Drink", "Grape", "Honey", "Knife", "Sushi", "Banana",
      "Carrot", "Cheese", "Cherry", "Orange", "TeaPod", "Avocado", "ChefHat", "CupSoda", "Dessert", "MilkOat", "EggFried", "Mushroom",
      "RiceBowl", "Utensils", "BubbleTea", "CakeSlice", "CandyCane", "SoftDrink", "CheeseCake", "CookingPot", "GlassWater", "KnifeBread", "MilkBottle", "MilkCarton",
      "PillBottle", "StreetFood", "Watermelon",
    ],
  },
  {
    id: "health",
    label: "Health & wellness",
    icons: [
      "Health", "Hospital", "Doctor", "Pill", "Stethoscope", "Syringe", "Ambulance", "Wheelchair", "Thermometer", "Dumbbell", "Yoga", "HeartPulse",
      "PillsTablet", "Bandage", "Pulse", "Blood", "Heart", "Vaccine", "YogaMat", "BloodBag", "GivePill", "Medicine", "Swimming", "Wellness",
      "YogaBall", "BloodType", "BookHeart", "GiveBlood", "HandHeart", "Injection", "ScanHeart", "DentalCare", "HeartCrack", "HouseHeart", "WorkoutRun", "BloodBottle",
      "BodyPartLeg", "DentalTooth", "FirstAidKit", "HospitalBed", "MedicalFile", "MedicalMask", "SwimmingCap", "DentalBraces", "EquipmentGym", "BloodPressure", "CalendarHeart", "MedicineSyrup",
      "BodyPartMuscle", "HeartHandshake", "MedicineBottle",
    ],
  },
  {
    id: "education",
    label: "Education & learning",
    icons: [
      "School", "University", "Diploma", "Library", "Student", "Teacher", "Notebook", "Backpack", "Lightbulb", "Bulb", "Idea", "Certificate",
      "Medal", "Honor", "Course", "SchoolBus", "SchoolTie", "StudyDesk", "StudyLamp", "Translate", "LibraryBig", "SchoolBell", "Whiteboard", "StudentCard",
      "AlphabetThai", "BulbCharging", "GraduateMale", "NotebookTabs", "NotebookText", "Presentation", "AlphabetGreek", "AlphabetHindi", "GraduationCap", "LanguageSkill", "SignLanguageC", "AlphabetArabic",
      "AlphabetBangla", "AlphabetHebrew", "AlphabetKorean", "GraduateFemale", "LanguageCircle", "LanguageSquare", "AlphabetChinese", "GlobalEducation", "MedalFirstPlace", "MedalThirdPlace", "AlphabetJapanese", "GraduationScroll",
      "MedalSecondPlace", "MessageTranslate", "SchoolReportCard",
    ],
  },
  {
    id: "time",
    label: "Time & scheduling",
    icons: [
      "Clock", "Time", "Watch", "Calendar", "Timer", "AlarmClock", "Hourglass", "DateTime", "TimeSchedule", "TimeHalfPass", "CarTime", "History",
      "Reminder", "TimeZone", "Timeline", "UserTime", "SalahTime", "StopWatch", "AlarmSmoke", "SmartWatch", "TimerReset", "ViewAgenda", "Appointment", "CalendarCog",
      "ClockFading", "MeetingRoom", "TimeQuarter", "TimeSetting", "WorkHistory", "CalendarDays", "CalendarFold", "CalendarLock", "CalendarLove", "CalendarSync", "CalendarUser", "DigitalClock",
      "HangingClock", "TimelineList", "VintageClock", "CalendarBlock", "CalendarClock", "CalendarRange", "NoMeetingRoom", "TimelineEvent", "ClipboardClock", "TimeManagement", "CalendarDateOne", "CalendarSetting",
      "TimeQuarterPass", "CalendarAnalysis", "CalendarFavorite",
    ],
  },
  {
    id: "transport",
    label: "Transport & vehicles",
    icons: [
      "Car", "Bus", "Truck", "Van", "Bike", "Scooter", "Train", "Helicopter", "Boat", "Ship", "Taxi", "Rocket",
      "Tractor", "Crane", "Forklift", "Fuel", "TrafficLight", "Road", "HotAirBalloon", "Tram", "Metro", "Plane", "Bicycle", "BusFront",
      "CarFront", "Sailboat", "TowTruck", "ToyTrain", "Astronaut", "CarSignal", "CargoShip", "DumpTruck", "Excavator", "FerryBoat", "LiftTruck", "PoliceCar",
      "SemiTruck", "ShipWheel", "Submarine", "TramFront", "CarParking", "CraneTower", "SpeedTrain", "TrafficJam", "TrainFront", "TrainTrack", "FuelStation", "RoadWayside",
      "TankerTruck", "TrafficCone", "TruckReturn",
    ],
  },
  {
    id: "weather",
    label: "Weather & energy",
    icons: [
      "CloudRain", "CloudSnow", "CloudLightning", "Sun", "Moon", "Snow", "Wind", "Rainbow", "Tornado", "Energy", "NuclearPower", "AtomicPower",
      "Rain", "Sunset", "SunSnow", "Sunrise", "FastWind", "RainDrop", "WindSurf", "Avalanche", "BioEnergy", "CloudHail", "EcoEnergy", "HousePlug",
      "MoonCloud", "PlugSocket", "SaveEnergy", "SolarPower", "BatteryFull", "CirclePower", "FolderCloud", "LaptopCloud", "PowerSocket", "SolarEnergy", "SquarePower", "Temperature",
      "WaterEnergy", "WindTurbine", "BatteryEmpty", "CloudBigRain", "CloudDrizzle", "CloudMidRain", "CloudMidSnow", "CloudSunRain", "ElectricHome", "ElectricWire", "MonitorCloud", "MoonFastWind",
      "MoonSlowWind", "MountainSnow", "PowerService",
    ],
  },
  {
    id: "nature",
    label: "Nature & environment",
    icons: [
      "Tree", "Leaf", "LeafyGreen", "Flower", "Cactus", "PineTree", "Mountain", "Star", "Droplet", "Fire", "Flame", "Earth",
      "Map", "MapPin", "Location", "Home", "House", "Fish", "Bird", "Galaxy", "Comet", "Asteroid", "Cat", "Lake",
      "Rose", "Wave", "Beach", "Horse", "Panda", "Plant", "Snail", "Clover", "Desert", "EcoLab", "Island", "Rabbit",
      "Sprout", "SunDim", "Turtle", "Eclipse", "Feather", "FirePit", "Octopus", "Recycle", "SunMoon", "FishFood", "MoonStar", "PawPrint",
      "Squirrel", "TentTree", "TreePalm",
    ],
  },
  {
    id: "places",
    label: "Places & travel",
    icons: [
      "Building", "City", "Hotel", "HospitalLocation", "Church", "Mosque", "Lighthouse", "Castle", "Bridge", "Passport", "Luggage", "Bank",
      "Plaza", "EiffelTower", "BerlinTower", "TwinTower", "PisaTower", "Tent", "Villa", "Office", "Cottage", "Factory", "Theater", "Landmark",
      "Apartment", "HotelBell", "MapPinPen", "NewOffice", "ChinaTemple", "MapPinHouse", "MaskTheater", "OfficeChair", "AlAqsaMosque", "MapPinXInside", "PassportValid", "PoliceStation",
      "MosqueLocation", "PassportExpired",
    ],
  },
  {
    id: "people",
    label: "People & teams",
    icons: [
      "User", "Users", "UserGroup", "UserMultiple", "UserCircle", "UserSquare", "Contact", "ContactRound", "Handshake", "TeamWork", "Profile", "Group",
      "PersonStanding", "Manager", "Mentor", "Clapping", "HandHelping", "Man", "Baby", "Child", "Smile", "Woman", "UserAi", "AddTeam",
      "BabyBed", "UserCog", "UserPen", "Wedding", "BookUser", "ChatUser", "FileUser", "ManWoman", "ScanFace", "StarFace", "UserEdit", "UserList",
      "UserLove", "UserStar", "FaceMimic", "UserBlock", "UserStory", "BabyBottle", "GroupItems", "ContactBook", "UserAccount", "UserSharing", "UserFullView", "UserQuestion",
      "UserRoadside", "UserRoundCog", "UserRoundKey",
    ],
  },
  {
    id: "commerce",
    label: "Commerce & finance",
    icons: [
      "Wallet", "ShoppingBag", "ShoppingCart", "ShoppingBasket", "Store", "Gift", "Tag", "Label", "Package", "Cashier", "Receipt", "Invoice",
      "Discount", "Coupon", "Barcode", "DeliveryBox", "DeliveryTruck", "TradeUp", "Briefcase", "Contracts", "Box", "FileBox", "HandBag", "SaleTag",
      "Trolley", "Voucher", "AppStore", "GiftCard", "GolfCart", "HotPrice", "ShopSign", "BoxingBag", "PlayStore", "TradeDown", "TradeMark", "TravelBag",
      "WalletDone", "BarcodeScan", "BoundingBox", "DiscountTag", "MarketOrder", "PackageOpen", "PackageSent", "ReceiptText", "WalletCards", "DeliverySent", "DeliveryView", "JusticeScale",
      "SafeDelivery", "CouponPercent", "DeliveryDelay", "PackageMoving", "StoreLocation", "TruckDelivery", "DeliveryReturn", "DeliverySecure", "MarketAnalysis", "PackageProcess", "PackageReceive", "StoreManagement",
      "DeliveryTracking", "PackageDelivered",
    ],
  },
  {
    id: "status",
    label: "Status & priority",
    icons: [
      "Flag", "Bookmark", "Crown", "Award", "Trophy", "Diamond", "Gem", "Sparkle", "Target", "Focus", "Goal", "ThumbsUp",
      "Ranking", "Ribbon", "FileStar", "Progress", "StarHalf", "Favourite", "MapPinned", "Milestone", "StackStar", "StarAward", "FocusPoint", "HonourStar",
      "RacingFlag", "StarCircle", "StarSquare", "AllBookmark", "FallingStar", "BookBookmark", "FileBookmark", "LaurelWreath", "ThumbsUpDown", "FileFavourite", "CursorProgress", "DiamondPercent",
      "FavouriteCircle", "FavouriteSquare", "ThumbsUpEllipse", "FlagTriangleLeft", "LaurelWreathLeft", "FlagTriangleRight", "LaurelWreathFirst", "LaurelWreathRight", "ThumbsUpRectangle", "BubbleChatFavourite", "CollectionsBookmark", "LeftToRightListStar",
      "ShoppingBagFavorite", "ShoppingCartFavorite", "ShoppingBasketFavorite",
    ],
  },
  {
    id: "gaming",
    label: "Gaming & fun",
    icons: [
      "Gamepad", "Joystick", "Dice", "Chess", "Puzzle", "Football", "Basketball", "Bowling", "Baseball", "Volleyball", "PartyPopper", "Balloon",
      "Kite", "MagicWand", "Ski", "Game", "Party", "Domino", "SdCard", "CardSim", "GolfBat", "GolfBall", "GolfHole", "ToyBrick",
      "BlockGame", "ChessKing", "ChessPawn", "ChessRook", "DiceFaces", "Fireworks", "ChessQueen", "MasterCard", "TennisBall", "BaseballBat", "BowlingBall", "BowlingPins",
      "ChessBishop", "ChessKnight", "TennisRacket", "FootballPitch", "BaseballHelmet", "BasketballHoop", "GameController", "TableTennisBat", "AmericanFootball", "LicenseThirdParty", "GamepadDirectional", "CursorMagicSelection",
    ],
  },
  {
    id: "science",
    label: "Science & engineering",
    icons: [
      "Atom", "FlaskConical", "Beaker", "Microscope", "Telescope", "Dna", "Molecules", "Physics", "Calculator", "Gears", "Magnet", "Radiation",
      "Orbit", "Engine", "Hammer", "Wrench", "Pickaxe", "TestTube", "Anvil", "Prism", "WaterPump", "PetrolPump", "Nut", "Infinity",
      "Pi", "Cog", "Bolt", "Math", "Drill", "Sigma", "GasPipe", "Gravity", "Bacteria", "HalalLab", "InsertPi", "RemovePi",
      "BoardMath", "Chemistry", "FlaskRound", "ColumnsThreeCog", "TestTubeDiagonal",
    ],
  },
  {
    id: "design",
    label: "Design & media",
    icons: [
      "Palette", "Brush", "PaintBrush", "ColorPicker", "Layers", "Canvas", "Artboard", "PenTool", "Pencil", "Ruler", "Crop", "Contrast",
      "Blur", "Pen", "Path", "Text", "Type", "Wand", "Frame", "Lasso", "Layer", "Sketch", "Compass", "PenLine",
      "Sticker", "BookText", "BookType", "ScanText", "TextBold", "TextFont", "TextWrap", "FolderPen", "LassoTool", "TabletPen", "TextClear", "TextColor",
      "TextQuote", "BlushBrush", "LayersLogo", "PaintBoard", "PencilLine", "TextCircle", "TextItalic", "TextSelect", "DrawingMode", "LassoSelect", "NotepadText", "PaintBucket",
      "PaintRoller", "PencilRuler", "TextAllCaps",
    ],
  },
  {
    id: "comms",
    label: "Communication",
    icons: [
      "Mail", "MailOpen", "MessageSquare", "MessageCircle", "Chat", "MessageQuestion", "Megaphone", "Bell", "BellRing", "Notification", "Phone", "Call",
      "Comment", "Rss", "Inbox", "AtSign", "Speech", "BellDot", "CallEnd", "Hashtag", "Mailbox", "Message", "CallDone", "ChatDone",
      "ChatEdit", "MailEdit", "MailLove", "MailSend", "CallSpark", "ChatDelay", "ChatSpark", "FlipPhone", "HoldPhone", "MailBlock", "MailReply", "PhoneCall",
      "Voicemail", "CallMissed", "CallPaused", "ChatIncome", "MailAtSign", "PhoneShake", "SmartPhone", "CallRinging", "ChatOutcome", "ChatPreview", "InboxUnread", "MailAccount",
      "MessageDone", "MessageEdit", "MessageLock",
    ],
  },
  {
    id: "files",
    label: "Files & folders",
    icons: [
      "File", "FileText", "FileAttachment", "FileQuestionMark", "Folder", "FolderOpen", "FolderEdit", "Archive", "Paperclip", "FileCog", "FilePen", "FilePin",
      "FileZip", "FileDiff", "FileEdit", "FilePlay", "FileScan", "FileSync", "FileType", "HtmlFile", "FileAudio", "FileBlock", "FileClock", "FileCloud",
      "FileDigit", "FileEmpty", "FileHeart", "FileImage", "FileMusic", "FilePaste", "FileStack", "FileVideo", "FolderCog", "FolderDot", "FolderGit", "FolderPin",
      "FolderZip", "FileBraces", "FileLocked", "FolderLock", "FolderRoot", "FolderTree", "FileArchive", "FilePenLine", "FileXCorner", "FolderAudio", "FolderBlock", "FolderClock",
      "FolderHeart", "FolderMusic", "FileChartPie",
    ],
  },
  {
    id: "office",
    label: "Office & documents",
    icons: [
      "Clipboard", "ClipboardList", "Book", "BookOpen", "Books", "Bookshelf", "Printer", "AddressBook", "StickyNote", "Eraser", "Highlighter", "Desk",
      "Stamp", "TapeMeasure", "SwatchBook", "Id", "Form", "Note", "BookA", "BookDown", "BookEdit", "CookBook", "NoteDone", "NoteEdit",
      "BookUpTwo", "BookDashed", "BookMarked", "BookOpenText", "LegalDocument", "PenConnectUsb", "PrinterThreeD", "ClipboardPaste", "AttachmentCircle", "AttachmentSquare", "ClipboardPenLine", "DocumentAttachment",
      "DocumentValidation",
    ],
  },
  {
    id: "objects",
    label: "Objects & tools",
    icons: [
      "Toolbox", "ToolCase", "Flashlight", "Anchor", "Pin", "Scissors", "Umbrella", "Glasses", "Lamp", "Lantern", "Bucket", "Shovel",
      "Axe", "HatGlasses", "Purse", "BendTool", "LampDesk", "Necklace", "WallLamp", "LampFloor", "SafetyPin", "VrGlasses", "LampWallUp", "LicensePin",
      "RollingPin", "AnchorPoint", "FishingHook", "LampCeiling", "LegalHammer", "PinLocation", "PocketKnife", "WavesLadder", "ArtboardTool", "IceCreamBowl", "LampWallDown", "OlympicTorch",
      "BrushCleaning", "SpoonAndKnife", "CleaningBucket", "DraftingCompass",
    ],
  },
];

/** Every catalog glyph, flattened in category order. */
export const PROJECT_ICON_NAMES: readonly IconName[] =
  PROJECT_ICON_CATEGORIES.flatMap((category) => category.icons);

/** Set view of the catalog, for validating a stored glyph name. */
export const PROJECT_ICON_NAME_SET: ReadonlySet<string> = new Set(PROJECT_ICON_NAMES);
