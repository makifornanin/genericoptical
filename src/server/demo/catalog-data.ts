/** Fictional demo catalogue. Brand and supplier names are invented for demonstration. */

export type FrameSpec = { name: string; brand: string; shape: string; material: "acetate" | "metal"; price: number; colors: string[]; sizes: string[]; supplier: string };

export const SUPPLIERS = [
  { code: "NWT", name: "Northwind Eyewear Trading", contactName: "Ramon Yap", email: "orders@northwind-eyewear.example", phone: "+63 2 8000 1101", paymentTerms: "Net 30", leadTimeDays: 5 },
  { code: "MFH", name: "Metro Frame House", contactName: "Liza Ong", email: "sales@metroframehouse.example", phone: "+63 2 8000 1102", paymentTerms: "Net 15", leadTimeDays: 4 },
  { code: "SUN", name: "Sunline Optical Imports", contactName: "Kevin Sy", email: "trade@sunline-optical.example", phone: "+63 2 8000 1103", paymentTerms: "Net 30", leadTimeDays: 7 },
  { code: "ASC", name: "AquaSoft Contact Lens Distributors", contactName: "Mae Lopez", email: "orders@aquasoft.example", phone: "+63 2 8000 1104", paymentTerms: "Net 30", leadTimeDays: 3 },
  { code: "CPS", name: "CarePlus Optical Supplies", contactName: "Joel Dizon", email: "hello@careplus-supplies.example", phone: "+63 2 8000 1105", paymentTerms: "COD", leadTimeDays: 3 },
  { code: "CLL", name: "Clarity Lens Laboratory", contactName: "Grace Uy", email: "lab@claritylens.example", phone: "+63 2 8000 1106", paymentTerms: "Net 15", leadTimeDays: 4 },
];

export const FRAMES: FrameSpec[] = [
  { name: "Arden 101", brand: "Arden", shape: "rectangle", material: "acetate", price: 2950, colors: ["black", "tortoise"], sizes: ["52", "54"], supplier: "NWT" },
  { name: "Arden 204", brand: "Arden", shape: "square", material: "acetate", price: 3450, colors: ["black", "crystal", "tortoise"], sizes: ["51"], supplier: "NWT" },
  { name: "Arden Round 33", brand: "Arden", shape: "round", material: "acetate", price: 3250, colors: ["tortoise", "black"], sizes: ["47", "49"], supplier: "NWT" },
  { name: "Halden Wire", brand: "Halden", shape: "round", material: "metal", price: 3950, colors: ["gold"], sizes: ["48", "50"], supplier: "MFH" },
  { name: "Halden Oval", brand: "Halden", shape: "oval", material: "metal", price: 3650, colors: ["gold"], sizes: ["50"], supplier: "MFH" },
  { name: "Halden Aviator RX", brand: "Halden", shape: "aviator", material: "metal", price: 4250, colors: ["gold", "black"], sizes: ["55"], supplier: "MFH" },
  { name: "Kiyo Slim", brand: "Kiyo", shape: "rectangle", material: "metal", price: 2450, colors: ["black", "gold"], sizes: ["53"], supplier: "MFH" },
  { name: "Kiyo Hex", brand: "Kiyo", shape: "hexagon", material: "metal", price: 3150, colors: ["gold", "black"], sizes: ["50"], supplier: "MFH" },
  { name: "Mesa Classic", brand: "Mesa", shape: "browline", material: "acetate", price: 3850, colors: ["black", "tortoise"], sizes: ["51", "53"], supplier: "NWT" },
  { name: "Mesa Cat 9", brand: "Mesa", shape: "cateye", material: "acetate", price: 3550, colors: ["black", "tortoise", "crystal"], sizes: ["52"], supplier: "NWT" },
  { name: "Brio Junior", brand: "Brio", shape: "rectangle", material: "acetate", price: 1850, colors: ["crystal", "black"], sizes: ["46"], supplier: "NWT" },
  { name: "Brio Flex Kids", brand: "Brio", shape: "round", material: "acetate", price: 1950, colors: ["crystal", "tortoise"], sizes: ["44"], supplier: "NWT" },
  { name: "Vela Air", brand: "Vela", shape: "oval", material: "acetate", price: 2650, colors: ["crystal", "black"], sizes: ["51"], supplier: "MFH" },
  { name: "Vela Square Pro", brand: "Vela", shape: "square", material: "acetate", price: 4650, colors: ["black", "tortoise"], sizes: ["53"], supplier: "MFH" },
  { name: "Solenne Muse", brand: "Solenne", shape: "cateye", material: "metal", price: 5450, colors: ["gold"], sizes: ["53"], supplier: "MFH" },
  { name: "Solenne Atelier", brand: "Solenne", shape: "round", material: "acetate", price: 5950, colors: ["tortoise", "black"], sizes: ["49"], supplier: "MFH" },
  { name: "Kiyo Titan", brand: "Kiyo", shape: "rectangle", material: "metal", price: 6450, colors: ["black"], sizes: ["54"], supplier: "MFH" },
  { name: "Arden Everyday", brand: "Arden", shape: "rectangle", material: "acetate", price: 1990, colors: ["black", "crystal"], sizes: ["51", "53"], supplier: "NWT" },
  { name: "Mesa Studio", brand: "Mesa", shape: "square", material: "acetate", price: 3350, colors: ["black", "tortoise", "crystal"], sizes: ["50", "52"], supplier: "NWT" },
  { name: "Halden Sable", brand: "Halden", shape: "oval", material: "acetate", price: 2850, colors: ["tortoise", "black"], sizes: ["49"], supplier: "MFH" },
];

export type SunSpec = { name: string; brand: string; shape: string; price: number; tints: string[] };
export const SUNGLASSES: SunSpec[] = [
  { name: "Solenne Riviera", brand: "Solenne", shape: "aviator", price: 4950, tints: ["green", "smoke"] },
  { name: "Mesa Coast", brand: "Mesa", shape: "square", price: 2950, tints: ["smoke", "brown"] },
  { name: "Vela Drift", brand: "Vela", shape: "round", price: 2650, tints: ["brown", "green"] },
  { name: "Mesa Cat Sun", brand: "Mesa", shape: "cateye", price: 3250, tints: ["smoke"] },
  { name: "Kiyo Sport Polarised", brand: "Kiyo", shape: "square", price: 3850, tints: ["smoke", "green"] },
  { name: "Brio Kids Sun", brand: "Brio", shape: "round", price: 1450, tints: ["smoke"] },
  { name: "Halden Pilot", brand: "Halden", shape: "aviator", price: 4450, tints: ["brown"] },
];

export const CONTACTS = [
  { name: "AquaSoft Daily (30 pack)", brand: "AquaSoft", price: 1650, cost: 980 },
  { name: "AquaSoft Monthly (6 pack)", brand: "AquaSoft", price: 1450, cost: 820 },
  { name: "AquaSoft Toric Monthly (6 pack)", brand: "AquaSoft", price: 2350, cost: 1380 },
  { name: "ClearDay Silicone Daily (30 pack)", brand: "ClearDay", price: 2150, cost: 1290 },
  { name: "ClearDay Bi-weekly (6 pack)", brand: "ClearDay", price: 990, cost: 560 },
];
export const POWERS = ["-1.00", "-2.00", "-3.00", "-4.50"];

export const CARE = [
  { name: "Multipurpose Solution 120 ml", image: "solution-bottle", price: 295, cost: 150, category: "cleaning" },
  { name: "Multipurpose Solution 360 ml", image: "solution-bottle", price: 595, cost: 310, category: "cleaning" },
  { name: "Lens Cleaning Spray 60 ml", image: "solution-bottle", price: 220, cost: 95, category: "cleaning" },
  { name: "Anti-fog Wipes (30)", image: "cloth", price: 250, cost: 110, category: "cleaning" },
  { name: "Microfiber Cloth", image: "cloth", price: 120, cost: 35, category: "cleaning" },
  { name: "Hard Shell Case", image: "case-hard", price: 350, cost: 140, category: "cases" },
  { name: "Folding Case", image: "case-hard", price: 450, cost: 180, category: "cases" },
  { name: "Kids Case", image: "case-hard", price: 280, cost: 110, category: "cases" },
  { name: "Retainer Cord", image: "accessory", price: 180, cost: 60, category: "accessories" },
  { name: "Silicone Nose Pads (pair)", image: "accessory", price: 150, cost: 40, category: "accessories" },
  { name: "Eyewear Repair Kit", image: "accessory", price: 260, cost: 90, category: "accessories" },
  { name: "Beaded Eyewear Chain", image: "accessory", price: 420, cost: 160, category: "accessories" },
];

export const RX_LENSES = [
  { name: "Single Vision 1.56 (pair)", price: 1500, cost: 450 },
  { name: "Single Vision Blue-light Filter (pair)", price: 2800, cost: 900 },
  { name: "Single Vision Thin 1.67 (pair)", price: 4500, cost: 1650 },
  { name: "Progressive Multifocal (pair)", price: 9500, cost: 3600 },
  { name: "Bifocal Flat-top (pair)", price: 3800, cost: 1300 },
  { name: "Photochromic Single Vision (pair)", price: 5200, cost: 1950 },
];

export const SERVICES = [
  { name: "Comprehensive Eye Examination", code: "eye_exam", price: 500 },
  { name: "Contact Lens Fitting", code: "cl_fitting", price: 800 },
  { name: "Frame Adjustment & Minor Repair", code: "repair", price: 200 },
  { name: "Lens Replacement Fitting", code: "lens_fit", price: 300 },
];

export const FIRST_NAMES = [
  "Andrea", "Bianca", "Carmela", "Danica", "Elena", "Francine", "Gabriela", "Hazel", "Isabel", "Janelle", "Katrina", "Lorraine", "Marisol", "Nicole",
  "Patricia", "Queenie", "Rowena", "Sofia", "Trisha", "Valerie", "Wendy", "Yvonne", "Angelo", "Benjie", "Carlos", "Dominic", "Emmanuel", "Francis",
  "Gerald", "Harold", "Ivan", "Jerome", "Kenneth", "Leandro", "Marco", "Nathan", "Oscar", "Paolo", "Rafael", "Samuel", "Tristan", "Vincent",
  "Joshua", "Miguel", "Aira", "Kyla", "Rhea", "Lance", "Bryan", "Mikaela", "Denise", "Arvin", "Clarisse", "Jasmine", "Noel", "Rey",
];
export const LAST_NAMES = [
  "Abad", "Aquino", "Bautista", "Castillo", "Cruz", "Dela Cruz", "Del Rosario", "Domingo", "Espino", "Fernandez", "Flores", "Garcia", "Gonzales",
  "Hernandez", "Ilagan", "Javier", "Lacson", "Lim", "Lopez", "Magno", "Manalo", "Marquez", "Mendoza", "Navarro", "Ocampo", "Pascual", "Perez",
  "Quiambao", "Ramos", "Reyes", "Rivera", "Salazar", "Santiago", "Soriano", "Tan", "Torres", "Uy", "Valdez", "Velasco", "Villanueva", "Yap", "Zamora",
];
