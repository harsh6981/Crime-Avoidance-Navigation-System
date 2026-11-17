// ═══════════════════════════════════════════════════════════════════════════
// SafePath — Mumbai Metropolitan Region (MMR) Boundaries & Coverage Model
// ═══════════════════════════════════════════════════════════════════════════
// Official MMRDA jurisdiction: ~6,328 km²
// Center: [19.12, 72.95], Default Viewport Zoom: 11
//
// Coverage Classifications:
// 1. "verified"   -> Direct historical crime FIR data available (BMC Wards with mapped stations)
// 2. "proximity"  -> Partial / proximity data (Border wards, MBMC Dahisar proximity)
// 3. "no-data"    -> No crime data recorded (Separate police commissionerates — NOT zero crime)
// ═══════════════════════════════════════════════════════════════════════════

export const MMR_CENTER = [19.12, 72.95];
export const MMR_DEFAULT_ZOOM = 11;

// Official Outer Boundary of the Mumbai Metropolitan Region (MMRDA)
export const MMR_OUTER_BOUNDARY = [
  // West Coast from South to North
  [18.890, 72.810], // South Colaba / Prongs Reef
  [18.960, 72.805], // Malabar Hill Coast
  [19.015, 72.815], // Worli Sea Face
  [19.060, 72.825], // Bandra Bandstand
  [19.110, 72.820], // Juhu / Versova
  [19.200, 72.795], // Madh / Marve
  [19.250, 72.780], // Gorai / Manori Beach
  [19.320, 72.775], // Uttan / Dongri (Mira-Bhayandar coast)
  [19.360, 72.770], // Vasai West Coast / Fort
  [19.420, 72.765], // Nallasopara Coast (Rajodi / Kalamb)
  [19.480, 72.760], // Virar West Coast (Arnala Beach)
  [19.520, 72.770], // Vaitarna Estuary / Saphale border (North-West tip)

  // Northern Inland Border (Vaitarna & Tansa Basins)
  [19.540, 72.850], // Virar East / Mandvi hills
  [19.530, 72.960], // Bhiwandi North / Tansa Wildlife Sanctuary border
  [19.460, 73.080], // Bhiwandi-Kalyan rural boundary

  // North-East / East Inland Border (Ulhas & Barvi Valleys)
  [19.390, 73.160], // Titwala / Kalyan North
  [19.280, 73.220], // Kalyan East / Ulhas River
  [19.200, 73.250], // Ambernath East / Malang Gad
  [19.140, 73.280], // Badlapur East foothills

  // South-East Inland Border (Karjat / Matheran / Panvel Hills)
  [19.060, 73.250], // Matheran foothills / Neral border
  [18.980, 73.220], // Panvel East / Chikhale / Karjat border
  [18.920, 73.180], // Panvel South / Karnala Bird Sanctuary hills
  [18.840, 73.120], // Pen / Khopoli border corridor

  // Southern Border (Dharamtar Creek / Uran / JNPT)
  [18.820, 73.020], // Uran South / Karanja Creek
  [18.860, 72.940], // JNPT / Nhava Sheva
  [18.890, 72.860], // Mumbai Harbour / Elephanta Channel
  [18.890, 72.810], // Close loop at South Colaba
];

// ── Status Styling & Labels ─────────────────────────────────────────────────
export const MMR_STATUS_CONFIG = {
  verified: {
    color: "#10b981",
    stroke: "#059669",
    bg: "rgba(16,185,129,0.16)",
    badge: "Available Data",
    label: "Direct Crime Data Available",
    tagline: "41,735 FIR records with mapped police stations",
    note: "Official Mumbai Police precinct-level historical records."
  },
  proximity: {
    color: "#f59e0b",
    stroke: "#d97706",
    bg: "rgba(245,158,11,0.16)",
    badge: "Partial / Proximity",
    label: "Partial / Proximity Data",
    tagline: "Border precinct coverage or transit centroid allocation",
    note: "Data inferred from adjacent police stations or border centroids."
  },
  "no-data": {
    color: "#64748b",
    stroke: "#94a3b8",
    bg: "rgba(100,116,139,0.14)",
    badge: "No Data Recorded",
    label: "No Crime Data Recorded",
    tagline: "Separate police commissionerate — NOT ZERO CRIME",
    note: "CRITICAL: This represents data unavailability from separate jurisdictions (e.g. Thane Police, Navi Mumbai Police), NOT an absence of crime. Never assume zero crime."
  }
};

// ── 9 MMR Municipal Corporations & Regions ─────────────────────────────────
export const MMR_CORPORATIONS = [
  {
    id: "mcgm",
    name: "Brihanmumbai Municipal Corporation (BMC / MCGM)",
    shortName: "Greater Mumbai (BMC)",
    type: "Municipal Corporation",
    center: [19.076, 72.877],
    status: "verified",
    jurisdiction: "Mumbai Police Commissionerate",
    crimeRecords: "41,735 FIRs (16 Verified Wards, 2 Proximity, 6 Missing)",
    roadStatus: "Fully Connected OSM Network (124,000+ segments)",
    coverageDesc: "Direct station-level FIR records across Island City, Western Suburbs, and Eastern Suburbs.",
    polygon: [
      [18.890, 72.810],
      [18.960, 72.805],
      [19.015, 72.815],
      [19.060, 72.825],
      [19.110, 72.820],
      [19.200, 72.795],
      [19.250, 72.780],
      [19.265, 72.855], // Dahisar border
      [19.250, 72.890], // Sanjay Gandhi National Park ridge
      [19.175, 72.960], // Mulund border
      [19.120, 72.940], // Vikhroli / Bhandup
      [19.050, 72.935], // Mankhurd / Vashi bridge entry
      [19.000, 72.870], // Wadala / Port trust
      [18.920, 72.840], // CST / Ballard Estate
      [18.890, 72.810]
    ]
  },
  {
    id: "tmc",
    name: "Thane Municipal Corporation (TMC)",
    shortName: "Thane City (TMC)",
    type: "Municipal Corporation",
    center: [19.218, 72.978],
    status: "no-data",
    jurisdiction: "Thane City Police Commissionerate",
    crimeRecords: "0 FIRs in Mumbai dataset (Unavailable — NOT zero crime)",
    roadStatus: "Fully Connected OSM Network (Eastern Express Hwy, Ghodbunder Rd)",
    coverageDesc: "Separate police commissionerate. Road routing is active; crime records are unavailable in the current dataset.",
    polygon: [
      [19.170, 72.955], // Mulund / Teen Hath Naka entry
      [19.175, 73.010], // Kalwa / Vitawa
      [19.200, 73.035], // Mumbra bypass
      [19.245, 73.015], // Kolshet / Balkum
      [19.280, 72.985], // Kasarvadavali / Ghodbunder
      [19.265, 72.940], // Owale / Sanjay Gandhi NP border
      [19.205, 72.945], // Majiwada / Vartak Nagar
      [19.170, 72.955]
    ]
  },
  {
    id: "nmmc",
    name: "Navi Mumbai Municipal Corporation (NMMC)",
    shortName: "Navi Mumbai (NMMC)",
    type: "Municipal Corporation",
    center: [19.033, 73.029],
    status: "no-data",
    jurisdiction: "Navi Mumbai Police Commissionerate",
    crimeRecords: "0 FIRs in Mumbai dataset (Unavailable — NOT zero crime)",
    roadStatus: "Fully Connected OSM Network (Sion-Panvel Hwy, Thane-Belapur Rd)",
    coverageDesc: "Separate police commissionerate covering Airoli to Belapur. Complete road routing network with neutral baseline safety scoring.",
    polygon: [
      [19.165, 72.990], // Digha / Airoli
      [19.130, 73.020], // Ghansoli / Mahape MIDC
      [19.085, 73.025], // Koparkhairane / Vashi
      [19.060, 72.980], // Vashi Creek Bridge link
      [19.030, 73.015], // Sanpada / Juinagar
      [18.995, 73.030], // Nerul / Seawoods
      [18.970, 73.045], // CBD Belapur
      [18.990, 73.070], // Turbhe / MIDC eastern ridge
      [19.165, 72.990]
    ]
  },
  {
    id: "mbmc",
    name: "Mira-Bhayandar Municipal Corporation (MBMC)",
    shortName: "Mira-Bhayandar (MBMC)",
    type: "Municipal Corporation",
    center: [19.295, 72.855],
    status: "proximity",
    jurisdiction: "Mira-Bhayandar, Vasai-Virar (MBVV) Police Commissionerate",
    crimeRecords: "Partial / Proximity (Dahisar Check Naka proximity)",
    roadStatus: "Fully Connected OSM Network (Western Express Hwy NH-48 corridor)",
    coverageDesc: "Adjacent to BMC Ward R/C Dahisar. Transit corridor connected; MBVV commissionerate crime data partially proximate.",
    polygon: [
      [19.265, 72.845], // Dahisar border
      [19.270, 72.885], // Kashimira / Ghodbunder link
      [19.325, 72.880], // Bhayandar East / Creek
      [19.330, 72.835], // Bhayandar West
      [19.310, 72.785], // Uttan / Gorai border
      [19.270, 72.805], // Rai / Murdha
      [19.265, 72.845]
    ]
  },
  {
    id: "vvcmc",
    name: "Vasai-Virar City Municipal Corporation (VVCMC)",
    shortName: "Vasai-Virar (VVCMC)",
    type: "Municipal Corporation",
    center: [19.391, 72.839],
    status: "no-data",
    jurisdiction: "MBVV Police Commissionerate",
    crimeRecords: "0 FIRs in Mumbai dataset (Unavailable — NOT zero crime)",
    roadStatus: "Fully Connected OSM Network (Vasai Road, Nallasopara, Virar)",
    coverageDesc: "Rapidly expanding northern urban region. Independent MBVV police jurisdiction.",
    polygon: [
      [19.335, 72.820], // Vasai Creek Bridge entry
      [19.350, 72.885], // Pelhar / NH-48
      [19.450, 72.875], // Virar East / Chandansar
      [19.480, 72.810], // Virar West / Arnala
      [19.410, 72.790], // Nallasopara West
      [19.350, 72.795], // Vasai West / Fort
      [19.335, 72.820]
    ]
  },
  {
    id: "kdmc",
    name: "Kalyan-Dombivli Municipal Corporation (KDMC)",
    shortName: "Kalyan-Dombivli (KDMC)",
    type: "Municipal Corporation",
    center: [19.235, 73.129],
    status: "no-data",
    jurisdiction: "Thane Police (Zone 3) / KDMC",
    crimeRecords: "0 FIRs in Mumbai dataset (Unavailable — NOT zero crime)",
    roadStatus: "Fully Connected OSM Network (Kalyan-Shilphata Rd, Agra Rd)",
    coverageDesc: "Eastern metropolitan hub. Complete road network topology with neutral safety scoring.",
    polygon: [
      [19.200, 73.070], // Dombivli West / Shilphata entry
      [19.210, 73.140], // Dombivli East / MIDC
      [19.245, 73.165], // Kalyan East / Waldhuni
      [19.265, 73.135], // Kalyan West / Gandhari
      [19.240, 73.080], // Mumbra / Kalwa approach
      [19.200, 73.070]
    ]
  },
  {
    id: "pmc",
    name: "Panvel Municipal Corporation (PMC)",
    shortName: "Panvel / CIDCO (PMC)",
    type: "Municipal Corporation",
    center: [18.990, 73.116],
    status: "no-data",
    jurisdiction: "Navi Mumbai Police Commissionerate (Zone 2)",
    crimeRecords: "0 FIRs in Mumbai dataset (Unavailable — NOT zero crime)",
    roadStatus: "Fully Connected OSM Network (Sion-Panvel Expressway, Mumbai-Pune Hwy)",
    coverageDesc: "Southern MMR gateway including Kharghar, Kamothe, Kalamboli, and Panvel. Connected via expressway arterial.",
    polygon: [
      [18.970, 73.050], // Kharghar entry / Belapur border
      [19.030, 73.065], // Kharghar Hills / Valley Golf Course
      [19.040, 73.120], // Taloja MIDC
      [19.005, 73.145], // Kalamboli / Panvel Bypass
      [18.960, 73.135], // New Panvel / Khanda Colony
      [18.945, 73.090], // Panvel South / JNPT road
      [18.970, 73.050]
    ]
  },
  {
    id: "bnmc",
    name: "Bhiwandi-Nizampur City Municipal Corporation (BNMC)",
    shortName: "Bhiwandi (BNMC)",
    type: "Municipal Corporation",
    center: [19.295, 73.058],
    status: "no-data",
    jurisdiction: "Thane Police (Zone 2)",
    crimeRecords: "0 FIRs in Mumbai dataset (Unavailable — NOT zero crime)",
    roadStatus: "Connected Road Network (Mumbai-Nashik Expressway)",
    coverageDesc: "Logistics and warehousing hub of MMR. Separate police jurisdiction.",
    polygon: [
      [19.260, 73.030],
      [19.330, 73.040],
      [19.325, 73.090],
      [19.270, 73.080],
      [19.260, 73.030]
    ]
  },
  {
    id: "umc",
    name: "Ulhasnagar Municipal Corporation (UMC)",
    shortName: "Ulhasnagar (UMC)",
    type: "Municipal Corporation",
    center: [19.215, 73.155],
    status: "no-data",
    jurisdiction: "Thane Police (Zone 4)",
    crimeRecords: "0 FIRs in Mumbai dataset (Unavailable — NOT zero crime)",
    roadStatus: "Connected Road Network",
    coverageDesc: "Industrial and residential corporation between Kalyan and Ambernath.",
    polygon: [
      [19.200, 73.140],
      [19.235, 73.145],
      [19.230, 73.175],
      [19.205, 73.170],
      [19.200, 73.140]
    ]
  }
];

