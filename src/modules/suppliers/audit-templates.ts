// AUTO-GENERATED from the AZM category audit templates (supplier-docx).
// Source of truth for the digitized Supplier Product-Commodity Audit forms.
// Regenerate with supplier-docx/gen.js. Do not hand-edit.

export interface AuditCheckpoint {
  /** Globally-unique id (used as the response key). */
  id: string;
  /** Display ref shown to the auditor (e.g. "C.1"). */
  label: string;
  requirement: string;
  evidence: string;
}
export interface AuditSection {
  title: string;
  checkpoints: AuditCheckpoint[];
}
export interface AuditCategoryGroup {
  title: string;
  items: string[];
}
export interface AuditTemplate {
  category: string;
  name: string;
  code: string;
  sections: AuditSection[];
  preVisitDocs: string[];
  categoryChecks: AuditCategoryGroup[];
  standards: { name: string; description: string }[];
}

export const AUDIT_TEMPLATES: Record<string, AuditTemplate> = {
  "A": {
    "category": "A",
    "name": "Flours, Swallows, Cereal & Powdered Staple Foods",
    "code": "AFZ-QA-FPS",
    "sections": [
      {
        "title": "Legal and Company Documentation",
        "checkpoints": [
          {
            "id": "A_s0_1",
            "label": "A.1",
            "requirement": "Valid business registration and operating licenses.",
            "evidence": "Corporate docs, local permits."
          },
          {
            "id": "A_s0_2",
            "label": "A.2",
            "requirement": "Valid food/health regulatory product approvals (e.g., NAFDAC).",
            "evidence": "Original certificates."
          },
          {
            "id": "A_s0_3",
            "label": "A.3",
            "requirement": "Trademark or proprietary intellectual property protection.",
            "evidence": "IP certificates."
          }
        ]
      },
      {
        "title": "Facility Infrastructure and Layout",
        "checkpoints": [
          {
            "id": "A_s1_1",
            "label": "B.1",
            "requirement": "Logical unidirectional process flow preventing cross-contamination (dirty to clean).",
            "evidence": "Visual layout, floor plan."
          },
          {
            "id": "A_s1_2",
            "label": "B.2",
            "requirement": "Adequate lighting (shatterproof covers) and ventilation in production areas.",
            "evidence": "Visual inspection."
          },
          {
            "id": "A_s1_3",
            "label": "B.3",
            "requirement": "Floors, walls, and ceilings are clean, smooth, impervious, and well-maintained.",
            "evidence": "Visual inspection."
          }
        ]
      },
      {
        "title": "Raw Material Control and Traceability",
        "checkpoints": [
          {
            "id": "A_s2_1",
            "label": "C.1",
            "requirement": "Documented supplier approval process for raw materials (tubers, grains, legumes).",
            "evidence": "Supplier list, intake logs."
          },
          {
            "id": "A_s2_2",
            "label": "C.2",
            "requirement": "Raw material inspection for foreign matter, mold, and moisture at intake.",
            "evidence": "Intake QC records."
          },
          {
            "id": "A_s2_3",
            "label": "C.3",
            "requirement": "Clear traceability system from raw material source to finished batch (1 step back, 1 step forward).",
            "evidence": "Traceability exercise."
          }
        ]
      },
      {
        "title": "Production Process Control",
        "checkpoints": [
          {
            "id": "A_s3_1",
            "label": "D.1",
            "requirement": "Moisture control protocols during drying to inhibit microbial/fungal growth.",
            "evidence": "Moisture meter logs."
          },
          {
            "id": "A_s3_2",
            "label": "D.2",
            "requirement": "Milling and sieving operations monitored for foreign matter (stones, metal). Sieve integrity checked regularly.",
            "evidence": "Sieve check records, magnet logs."
          },
          {
            "id": "A_s3_3",
            "label": "D.3",
            "requirement": "Allergen segregation during blending/milling, especially for Soy and Beans products.",
            "evidence": "Production schedule, SOPs."
          }
        ]
      },
      {
        "title": "Hygiene, Sanitation, and Pest Control",
        "checkpoints": [
          {
            "id": "A_s4_1",
            "label": "E.1",
            "requirement": "Cleaning validation between product runs to prevent cross-contamination.",
            "evidence": "Master cleaning schedule."
          },
          {
            "id": "A_s4_2",
            "label": "E.2",
            "requirement": "Active and documented pest control program covering rodents, birds, and insects.",
            "evidence": "Bait station map, contract."
          },
          {
            "id": "A_s4_3",
            "label": "E.3",
            "requirement": "Potable water used for processing (washing tubers, fermentation).",
            "evidence": "Water analysis report."
          }
        ]
      },
      {
        "title": "Quality Control and Laboratory Testing",
        "checkpoints": [
          {
            "id": "A_s5_1",
            "label": "F.1",
            "requirement": "Calibration of scales, weights, and moisture meters.",
            "evidence": "Calibration certificates."
          },
          {
            "id": "A_s5_2",
            "label": "F.2",
            "requirement": "Routine testing for Aflatoxins/Mycotoxins in susceptible products (cereals, legumes).",
            "evidence": "COA / External lab reports."
          },
          {
            "id": "A_s5_3",
            "label": "F.3",
            "requirement": "Routine microbial and toxicological analysis per product batch/period.",
            "evidence": "Lab reports."
          }
        ]
      },
      {
        "title": "Product Specifications & Finished Goods Release",
        "checkpoints": [
          {
            "id": "A_s6_1",
            "label": "G.1",
            "requirement": "Documented finished product specifications (organoleptic, physical, chemical parameters).",
            "evidence": "Spec sheets."
          },
          {
            "id": "A_s6_2",
            "label": "G.2",
            "requirement": "Positive release system before dispatch to market or Afrizonemart.",
            "evidence": "QA sign-off logs."
          }
        ]
      },
      {
        "title": "Packaging, Labeling, and Shelf-Life Control",
        "checkpoints": [
          {
            "id": "A_s7_1",
            "label": "H.1",
            "requirement": "Food-grade packaging material with verified seal integrity (prevents moisture ingress).",
            "evidence": "Packaging supplier specs."
          },
          {
            "id": "A_s7_2",
            "label": "H.2",
            "requirement": "Clear batch coding, production date, and expiration date printed on primary packaging.",
            "evidence": "Visual inspection of packs."
          },
          {
            "id": "A_s7_3",
            "label": "H.3",
            "requirement": "Substantiated shelf-life claims supported by stability tests.",
            "evidence": "Shelf-life study data."
          },
          {
            "id": "A_s7_4",
            "label": "H.4",
            "requirement": "Labels declare accurate ingredients,nutritional info, allergens, and preparation instructions.",
            "evidence": "Label artwork review."
          }
        ]
      },
      {
        "title": "Storage, Warehousing, and Dispatch",
        "checkpoints": [
          {
            "id": "A_s8_1",
            "label": "I.1",
            "requirement": "Products stored off the floor (on pallets) and away from walls.",
            "evidence": "Visual inspection."
          },
          {
            "id": "A_s8_2",
            "label": "I.2",
            "requirement": "Storage conditions are dry, well-ventilated, and temperature-monitored.",
            "evidence": "Temp/Humidity logs."
          }
        ]
      },
      {
        "title": "Staff Competence, PPE, and Training",
        "checkpoints": [
          {
            "id": "A_s9_1",
            "label": "J.1",
            "requirement": "Production staff wear appropriate PPE (hairnets, aprons, gloves, dedicated footwear).",
            "evidence": "Visual inspection."
          },
          {
            "id": "A_s9_2",
            "label": "J.2",
            "requirement": "Documented food safety, hygiene, and allergen awareness training for staff.",
            "evidence": "Training matrices."
          }
        ]
      },
      {
        "title": "Sustainability and Waste Handling",
        "checkpoints": [
          {
            "id": "A_s10_1",
            "label": "K.1",
            "requirement": "Safe and timely disposal of production waste (peels, husks, chaff).",
            "evidence": "Waste management SOP."
          }
        ]
      },
      {
        "title": "Export Readiness and Standards Alignment",
        "checkpoints": [
          {
            "id": "A_s11_1",
            "label": "L.1",
            "requirement": "Complaint management and product recall readiness (documented mock recall).",
            "evidence": "Recall procedure/logs."
          },
          {
            "id": "A_s11_2",
            "label": "L.2",
            "requirement": "Alignment with AfCFTA / FDA / EU standards requirements (based on target market).",
            "evidence": "Export registrations."
          }
        ]
      }
    ],
    "preVisitDocs": [
      "Company Registration & Tax Identification",
      "Finished Product Lab Analysis (Microbial & Toxicology)",
      "NAFDAC/FDA Certificates or Equivalent Approvals",
      "Pest Control Contract and Service Logs",
      "Standard Organization Certifications (e.g., SONCAP)",
      "Equipment Calibration Certificates (Scales, Moisture meters)",
      "Standard Operating Procedures (SOPs) for Milling/Drying",
      "Export Documentation / AfCFTA Registrations (if applicable)"
    ],
    "categoryChecks": [
      {
        "title": "",
        "items": [
          "The auditor must verify the following critical quality parameters specific to the raw material classifications:"
        ]
      },
      {
        "title": "Cassava & Fufu Products",
        "items": [
          "Cyanide Reduction: Evidence of adequate soaking, fermentation, and pressing to reduce hydrocyanic acid to safe limits.",
          "Fermentation Control: Consistency in fermentation time to prevent off-odors and ensure standard pH.",
          "Drying Efficiency: Fast and hygienic drying (sun-drying on raised platforms or flash/cabinet dryers) to prevent mold."
        ]
      },
      {
        "title": "Yam & Poundo Products",
        "items": [
          "Enzymatic Browning Prevention: Controls during peeling and parboiling to maintain white/cream color without excessive use of unapproved sulfites.",
          "Starch Gelatinization: Verification of parboiling temperature/time to achieve instant reconstitution properties for the consumer."
        ]
      },
      {
        "title": "Cereal & Pap Powders",
        "items": [
          "Aflatoxin Monitoring: Stringent intake screening for moldy grains (maize, sorghum, millet).",
          "Foreign Matter: Effective destoning and washing processes before milling.",
          "Roasting Controls: Consistent time/temperature logs for roasted grains to develop flavor and reduce moisture."
        ]
      },
      {
        "title": "Legume, Soy & Beans Flours",
        "items": [
          "Anti-Nutritional Factors: Verification of heat treatment (roasting/boiling) parameters to deactivate trypsin inhibitors in soybeans and beans.",
          "Allergen Cross-Contact: Clear segregation of soy products from non-soy products during milling and packaging."
        ]
      },
      {
        "title": "Plantain & Cocoyam Flours",
        "items": [
          "Maturity Indexing: Use of strictly unripe plantains to maintain low sugar/high starch content suitable for diabetics.",
          "Oxalate Reduction (Cocoyam): Verification of proper peeling, washing, and heat treatment to minimize acridity (calcium oxalate crystals)."
        ]
      }
    ],
    "standards": [
      {
        "name": "NAFDAC",
        "description": "National Agency for Food and Drug Administration and Control. Verify valid registration numbers on packaging and current facility approval status."
      },
      {
        "name": "SON / NIS",
        "description": "Standard Organization of Nigeria. Verify conformity to specific NIS standards for composite flours and staple powders."
      },
      {
        "name": "HACCP / GMP",
        "description": "Verify the existence of a documented Hazard Analysis, identification of Critical Control Points (e.g., drying, sieving), and basic Good Manufacturing Practices."
      },
      {
        "name": "ISO 22000 (Optional/Export)",
        "description": "Food Safety Management System. A significant advantage for export markets. Verify certificate validity and scope if claimed."
      },
      {
        "name": "Codex Alimentarius",
        "description": "International food standards. Verify that labeling principles (allergens, ingredients, lot coding) align with Codex guidelines."
      },
      {
        "name": "AfCFTA Documentation",
        "description": "Verify readiness for intra-African trade, including Certificate of Origin and compliance with Rules of Origin."
      }
    ]
  },
  "B": {
    "category": "B",
    "name": "Edible Oils, Functional Botanicals & Infusions",
    "code": "AFZ-QA-OBI",
    "sections": [
      {
        "title": "SECTION A: PRODUCT SCOPE & IDENTITY VERIFICATION",
        "checkpoints": [
          {
            "id": "B_s0_1",
            "label": "A.1",
            "requirement": "Physical products available on-site exactly match the submitted questionnaire profiles (Moringa variants, Red Palm Oils).",
            "evidence": ""
          },
          {
            "id": "B_s0_2",
            "label": "A.2",
            "requirement": "Product formulations/recipes align strictly with declared edible oils and botanical infusions, free of undeclared additives.",
            "evidence": ""
          }
        ]
      },
      {
        "title": "SECTION B: BUSINESS LEGITIMACY & REGULATORY READINESS",
        "checkpoints": [
          {
            "id": "B_s1_1",
            "label": "B.1",
            "requirement": "Valid business incorporation and tax registration documents are available and verified.",
            "evidence": ""
          },
          {
            "id": "B_s1_2",
            "label": "B.2",
            "requirement": "Current and active NAFDAC, FDA, or equivalent regulatory registration available for ALL in-scope products.",
            "evidence": ""
          },
          {
            "id": "B_s1_3",
            "label": "B.3",
            "requirement": "SON (Standards Organisation of Nigeria) MANCAP certificates or equivalent quality standards evidence is available.",
            "evidence": ""
          }
        ]
      },
      {
        "title": "SECTION C: FACILITY INFRASTRUCTURE, HYGIENE & GMP READINESS",
        "checkpoints": [
          {
            "id": "B_s2_1",
            "label": "C.1",
            "requirement": "Premises are clean, well-lit, properly ventilated, and strictly free from evidence of rodents/pests.",
            "evidence": ""
          },
          {
            "id": "B_s2_2",
            "label": "C.2",
            "requirement": "Clear physical separation between raw material receiving (palm nuts, raw moringa leaves) and finished goods packing areas.",
            "evidence": ""
          }
        ]
      },
      {
        "title": "SECTION D: RAW MATERIAL CONTROL, TRACEABILITY & SOURCING INTEGRITY",
        "checkpoints": [
          {
            "id": "B_s4_1",
            "label": "D.1",
            "requirement": "Sourcing records/supplier approvals are maintained for fresh palm fruits and botanical ingredients (Zobo, Lemongrass, Moringa).",
            "evidence": ""
          },
          {
            "id": "B_s4_2",
            "label": "D.2",
            "requirement": "A working traceability system successfully links an incoming raw material batch to a finished product lot number.",
            "evidence": ""
          },
          {
            "id": "B_s4_3",
            "label": "D.3",
            "requirement": "Storage of raw botanicals protects against moisture ingress and fungal/mycotoxin development.",
            "evidence": ""
          }
        ]
      },
      {
        "title": "SECTION E: PROCESSING CONTROLS, QA & BATCH CONSISTENCY",
        "checkpoints": [
          {
            "id": "B_s5_1",
            "label": "E.1",
            "requirement": "Palm Oil Extraction: Milling, sterilization, and clarification processes are temperature and hygiene controlled to prevent rapid oxidation.",
            "evidence": ""
          },
          {
            "id": "B_s5_2",
            "label": "E.2",
            "requirement": "Botanicals (Tea/Powders): Drying/dehydration process is strictly monitored to prevent mold growth while preserving nutrient integrity.",
            "evidence": ""
          },
          {
            "id": "B_s5_3",
            "label": "E.3",
            "requirement": "Standard Operating Procedures (SOPs) or HACCP plans are documented, visible, and followed by production staff.",
            "evidence": ""
          }
        ]
      },
      {
        "title": "SECTION F: PRODUCT TESTING, SPECIFICATIONS & CLAIMS SUBSTANTIATION",
        "checkpoints": [
          {
            "id": "B_s6_1",
            "label": "F.1",
            "requirement": "Palm Oil Parameters: Free Fatty Acid (FFA), moisture, DOBI, and impurity limits are regularly tested via internal or third-party labs.",
            "evidence": ""
          },
          {
            "id": "B_s6_2",
            "label": "F.2",
            "requirement": "Red Palm Oil Integrity: Verification of complete absence of adulteration (e.g., Sudan IV dyes, artificial colorants).",
            "evidence": ""
          },
          {
            "id": "B_s6_3",
            "label": "F.3",
            "requirement": "Powders/Teas Parameters: Moisture control (<10%) and microbial testing (Salmonella, E.coli, mold) verified via recent COAs.",
            "evidence": ""
          },
          {
            "id": "B_s6_4",
            "label": "F.4",
            "requirement": "Shelf-life claims are supported by stability studies or historical retention sample data.",
            "evidence": ""
          }
        ]
      },
      {
        "title": "SECTION G: PACKAGING, LABELING & EXPORT READINESS",
        "checkpoints": [
          {
            "id": "B_s7_1",
            "label": "G.1",
            "requirement": "Packaging Integrity: Leak-proof, food-grade PET/Glass for oils; moisture/light-barrier pouches for teas and powders.",
            "evidence": ""
          },
          {
            "id": "B_s7_2",
            "label": "G.2",
            "requirement": "Labeling Completeness: Includes full ingredient list, allergen declarations, net weight, nutritional facts, and storage instructions.",
            "evidence": ""
          },
          {
            "id": "B_s7_3",
            "label": "G.3",
            "requirement": "Batch coding (manufacturing date, expiry date, lot number) is clearly printed and indelible on retail units.",
            "evidence": ""
          }
        ]
      },
      {
        "title": "SECTION H: SUSTAINABILITY, ETHICAL PRODUCTION & COMMERCIAL READINESS",
        "checkpoints": [
          {
            "id": "B_s9_1",
            "label": "H.1",
            "requirement": "Responsible waste management observed (disposal of palm kernels/effluent, botanical waste composting).",
            "evidence": ""
          },
          {
            "id": "B_s9_2",
            "label": "H.2",
            "requirement": "Commercial Readiness: Facility possesses the capacity to meet stated Minimum Order Quantities (MOQ) and production lead times.",
            "evidence": ""
          }
        ]
      }
    ],
    "preVisitDocs": [],
    "categoryChecks": [],
    "standards": []
  },
  "C": {
    "category": "C",
    "name": "Snacks, Nuts & Ready-to-Eat Dry Foods",
    "code": "AFZ-QA-SNK",
    "sections": [
      {
        "title": "6. Pre-Visit Document Review & Certifications",
        "checkpoints": [
          {
            "id": "C_s0_1",
            "label": "1",
            "requirement": "6.1 Valid NAFDAC/NSO registrations are available and match claimed products.",
            "evidence": ""
          },
          {
            "id": "C_s0_2",
            "label": "2",
            "requirement": "6.2 Third-party certifications (HACCP, Eco-Friendly) are valid and issued by accredited bodies.",
            "evidence": ""
          },
          {
            "id": "C_s0_3",
            "label": "3",
            "requirement": "6.3 Shelf-life claims (3 to 14 months) are backed by scientific stability data or historical logs.",
            "evidence": ""
          }
        ]
      },
      {
        "title": "Processing Controls (Roasting, Frying, Moisture)",
        "checkpoints": [
          {
            "id": "C_s1_1",
            "label": "1",
            "requirement": "7.1.1 Time and temperature controls are documented for peanut roasting and plantain frying.",
            "evidence": ""
          },
          {
            "id": "C_s1_2",
            "label": "2",
            "requirement": "7.1.2 Frying oil quality is monitored (Free Fatty Acids/Polar compounds); reuse policies are established.",
            "evidence": ""
          },
          {
            "id": "C_s1_3",
            "label": "3",
            "requirement": "7.1.3 Cassava processing (Garri/Pipivita) includes verified steps to eliminate cyanide to safe levels.",
            "evidence": ""
          },
          {
            "id": "C_s1_4",
            "label": "4",
            "requirement": "7.1.4 Moisture limits (Aw) are controlled to prevent mold/aflatoxin in nuts and dry flours.",
            "evidence": ""
          }
        ]
      },
      {
        "title": "Hygiene, Allergen & Foreign Matter Control",
        "checkpoints": [
          {
            "id": "C_s2_1",
            "label": "1",
            "requirement": "7.2.1 Clear segregation between allergen-containing (Peanuts, Maize) and non-allergen processing lines.",
            "evidence": ""
          },
          {
            "id": "C_s2_2",
            "label": "2",
            "requirement": "7.2.2 Foreign matter controls in place (sieves for flour/garri, magnets, visual sorting for nuts).",
            "evidence": ""
          },
          {
            "id": "C_s2_3",
            "label": "3",
            "requirement": "7.2.3 Facility demonstrates adequate pest control (no signs of rodents/insects in dry storage).",
            "evidence": ""
          },
          {
            "id": "C_s2_4",
            "label": "4",
            "requirement": "7.2.4 Personnel hygiene practices observed (hairnets, gloves, clean uniforms, handwashing).",
            "evidence": ""
          }
        ]
      },
      {
        "title": "Storage, Packaging & Traceability",
        "checkpoints": [
          {
            "id": "C_s3_1",
            "label": "1",
            "requirement": "7.3.1 Raw materials and finished goods are stored off the floor in cool, dry conditions.",
            "evidence": ""
          },
          {
            "id": "C_s3_2",
            "label": "2",
            "requirement": "7.3.2 Seal integrity of packaging (airtight checks for Pipivita, bottled groundnuts, chips) is verified.",
            "evidence": ""
          },
          {
            "id": "C_s3_3",
            "label": "3",
            "requirement": "7.3.3 Labels accurately reflect ingredients, warnings (e.g., choking hazard, allergen alerts), and weight.",
            "evidence": ""
          },
          {
            "id": "C_s3_4",
            "label": "4",
            "requirement": "7.3.4 Batch coding is clearly printed on final packaging, allowing full trace-back to raw ingredients.",
            "evidence": ""
          }
        ]
      },
      {
        "title": "8. Export & Compliance Readiness",
        "checkpoints": [
          {
            "id": "C_s4_1",
            "label": "1",
            "requirement": "8.1 Products destined for export meet destination labeling requirements (e.g., FDA nutrition facts, EU allergen bolding).",
            "evidence": ""
          },
          {
            "id": "C_s4_2",
            "label": "2",
            "requirement": "8.2 Packaging materials are robust enough to withstand international freight and logistics handling.",
            "evidence": ""
          },
          {
            "id": "C_s4_3",
            "label": "3",
            "requirement": "8.3 Management demonstrates awareness of AfCFTA, USA, or EUDR documentation processes.",
            "evidence": ""
          }
        ]
      }
    ],
    "preVisitDocs": [],
    "categoryChecks": [],
    "standards": []
  },
  "D": {
    "category": "D",
    "name": "Cosmetics, Personal Care & Topical Wellness",
    "code": "AFZ-QA-CPW",
    "sections": [
      {
        "title": "Legal Entity & Site Registration",
        "checkpoints": [
          {
            "id": "D_s0_1",
            "label": "1",
            "requirement": "Valid business registration matching questionnaire entity",
            "evidence": "Corporate affairs certificates, tax IDs"
          },
          {
            "id": "D_s0_2",
            "label": "2",
            "requirement": "Valid facility/manufacturing licenses",
            "evidence": "Local municipal or national manufacturing permits"
          }
        ]
      },
      {
        "title": "Cosmetic GMP / Hygiene / Zoning",
        "checkpoints": [
          {
            "id": "D_s1_1",
            "label": "1",
            "requirement": "Facility layout prevents cross-contamination",
            "evidence": "Physical separation of raw, WIP, and finished goods"
          },
          {
            "id": "D_s1_2",
            "label": "2",
            "requirement": "Appropriate sanitation and hygiene protocols",
            "evidence": "Cleaning logs, staff PPE, handwashing stations"
          }
        ]
      },
      {
        "title": "Raw Material Control & Supplier Approval",
        "checkpoints": [
          {
            "id": "D_s2_1",
            "label": "1",
            "requirement": "Incoming material inspection and quarantine",
            "evidence": "Goods receipt logs, COAs from suppliers"
          },
          {
            "id": "D_s2_2",
            "label": "2",
            "requirement": "Water quality management (if used in formulation)",
            "evidence": "Water testing records (microbial and chemical)"
          }
        ]
      },
      {
        "title": "Formula Control, Allergen & Restricted Substance Review",
        "checkpoints": [
          {
            "id": "D_s3_1",
            "label": "1",
            "requirement": "Master formulation records match declared ingredients",
            "evidence": "Approved formula sheets, BOMs"
          },
          {
            "id": "D_s3_2",
            "label": "2",
            "requirement": "Allergen and restricted substance monitoring",
            "evidence": "Fragrance IFRA certificates, heavy metal checks"
          }
        ]
      },
      {
        "title": "Production Process Controls and Batch Records",
        "checkpoints": [
          {
            "id": "D_s4_1",
            "label": "1",
            "requirement": "Standard Operating Procedures (SOPs) followed",
            "evidence": "Documented mixing/heating/cooling steps"
          },
          {
            "id": "D_s4_2",
            "label": "2",
            "requirement": "Comprehensive batch manufacturing records",
            "evidence": "Signed batch sheets with exact quantities and yields"
          }
        ]
      },
      {
        "title": "Packaging, Labels and Claims Substantiation",
        "checkpoints": [
          {
            "id": "D_s5_1",
            "label": "1",
            "requirement": "Labels comply with international cosmetic standards",
            "evidence": "INCI ingredient lists, net weight, warnings, batch/expiry"
          },
          {
            "id": "D_s5_2",
            "label": "2",
            "requirement": "Marketing claims possess documented substantiation",
            "evidence": "Lab tests for \"Organic\", \"Eco-friendly\", \"Efficacy\""
          }
        ]
      },
      {
        "title": "Safety, Stability, Microbial and Efficacy Support",
        "checkpoints": [
          {
            "id": "D_s6_1",
            "label": "1",
            "requirement": "Product stability and shelf-life justification",
            "evidence": "Accelerated or real-time stability test reports"
          },
          {
            "id": "D_s6_2",
            "label": "2",
            "requirement": "Microbial challenge testing (Preservative Efficacy)",
            "evidence": "PET/Challenge test results for water-containing items"
          }
        ]
      },
      {
        "title": "Traceability, Complaints and Recall Readiness",
        "checkpoints": [
          {
            "id": "D_s7_1",
            "label": "1",
            "requirement": "Forward and backward traceability system",
            "evidence": "Ability to trace from finished batch to raw material"
          },
          {
            "id": "D_s7_2",
            "label": "2",
            "requirement": "Recall procedure and complaint handling",
            "evidence": "Documented recall SOP, customer complaint log"
          }
        ]
      },
      {
        "title": "Warehouse, Dispatch and Transport Controls",
        "checkpoints": [
          {
            "id": "D_s8_1",
            "label": "1",
            "requirement": "Storage conditions meet product requirements",
            "evidence": "Temperature/humidity logs (cool, dry place as claimed)"
          },
          {
            "id": "D_s8_2",
            "label": "2",
            "requirement": "FIFO / FEFO stock rotation",
            "evidence": "Inventory management system or physical tagging"
          }
        ]
      },
      {
        "title": "ESG, Ethical Sourcing & Community Sourcing",
        "checkpoints": [
          {
            "id": "D_s9_1",
            "label": "1",
            "requirement": "Fair trade and ethical production claims verified",
            "evidence": "Contracts, payment records for local/women communities"
          },
          {
            "id": "D_s9_2",
            "label": "2",
            "requirement": "Environmental and waste management",
            "evidence": "Proper disposal of chemical/ash waste, biodegradable proof"
          }
        ]
      }
    ],
    "preVisitDocs": [],
    "categoryChecks": [],
    "standards": []
  },
  "E": {
    "category": "E",
    "name": "Fashion, Footwear & Crafted Lifestyle Products",
    "code": "AFZ-QA-FFC",
    "sections": [
      {
        "title": "Product Conformity Assessment",
        "checkpoints": [
          {
            "id": "E_s0_1",
            "label": "1",
            "requirement": "A. General Product Quality & Identity",
            "evidence": ""
          },
          {
            "id": "E_s0_2",
            "label": "2",
            "requirement": "Product matches description and specifications provided in the onboarding",
            "evidence": ""
          },
          {
            "id": "E_s1_1",
            "label": "1",
            "requirement": "questionnaire.",
            "evidence": ""
          },
          {
            "id": "E_s1_2",
            "label": "2",
            "requirement": "Materials used match declared ingredients (e.g., genuine leather, authentic Ankara/Asooke).",
            "evidence": ""
          },
          {
            "id": "E_s1_3",
            "label": "3",
            "requirement": "Overall craftsmanship and workmanship reflect premium/export quality.",
            "evidence": ""
          },
          {
            "id": "E_s1_4",
            "label": "4",
            "requirement": "Fit and sizing consistency across sampled batches (standardized grading).",
            "evidence": ""
          },
          {
            "id": "E_s1_5",
            "label": "5",
            "requirement": "Durability indicators (resistance to normal wear, tear, and handling).",
            "evidence": ""
          },
          {
            "id": "E_s1_6",
            "label": "6",
            "requirement": "B. Labeling, Packaging & Traceability",
            "evidence": ""
          },
          {
            "id": "E_s1_7",
            "label": "7",
            "requirement": "Products feature secure, legible brand tags or internal stamping.",
            "evidence": ""
          },
          {
            "id": "E_s1_8",
            "label": "8",
            "requirement": "Care instructions and material composition are clearly stated (crucial for export).",
            "evidence": ""
          },
          {
            "id": "E_s1_9",
            "label": "9",
            "requirement": "Packaging suitability: Protects against moisture, dust, and transit damage.",
            "evidence": ""
          },
          {
            "id": "E_s1_10",
            "label": "10",
            "requirement": "Traceability: Product can be traced back to a specific production batch/artisan.",
            "evidence": ""
          },
          {
            "id": "E_s1_11",
            "label": "11",
            "requirement": "Export Readiness: Barcodes, country of origin marks (\"Made in Nigeria\") are present.",
            "evidence": ""
          },
          {
            "id": "E_s1_12",
            "label": "12",
            "requirement": "C. Special Checks: Apparel (e.g., OSEbyGeniusHub)",
            "evidence": ""
          },
          {
            "id": "E_s1_13",
            "label": "13",
            "requirement": "Fabric defects: Absence of unapproved slubs, stains, or weaving errors.",
            "evidence": ""
          },
          {
            "id": "E_s1_14",
            "label": "14",
            "requirement": "Pattern matching: Patterns align correctly at seams (critical for Ankara/Adire).",
            "evidence": ""
          },
          {
            "id": "E_s1_15",
            "label": "15",
            "requirement": "Seam strength & tension: No puckering, skipped stitches, or loose threads.",
            "evidence": ""
          },
          {
            "id": "E_s1_16",
            "label": "16",
            "requirement": "Hemming and finishing: Cleanly surged or bound edges, straight hems.",
            "evidence": ""
          },
          {
            "id": "E_s1_17",
            "label": "17",
            "requirement": "Fastenings & Embellishments: Zippers, buttons, and elastic bands are securely attached and functional.",
            "evidence": ""
          },
          {
            "id": "E_s1_18",
            "label": "18",
            "requirement": "Shrinkage/Colorfastness: Supplier has documented declarations or tests for fabric bleed.",
            "evidence": ""
          },
          {
            "id": "E_s1_19",
            "label": "19",
            "requirement": "D. Special Checks: Footwear (e.g., Jasmine’s Hub)",
            "evidence": ""
          },
          {
            "id": "E_s1_20",
            "label": "20",
            "requirement": "Sole bonding: Adhesive application is clean, secure, without gaps or excess glue seepage.",
            "evidence": ""
          },
          {
            "id": "E_s2_1",
            "label": "1",
            "requirement": "Edge finishing: Soles and leather edges are cleanly cut, buffed, and sealed.",
            "evidence": ""
          },
          {
            "id": "E_s2_2",
            "label": "2",
            "requirement": "Upper alignment: Straps, vamps, and uppers are symmetrically aligned on both left and right shoes.",
            "evidence": ""
          },
          {
            "id": "E_s2_3",
            "label": "3",
            "requirement": "Fastening quality: Buckles, Velcro, or stitching on straps are secure under tension.",
            "evidence": ""
          },
          {
            "id": "E_s2_4",
            "label": "4",
            "requirement": "Insole comfort: Adequate padding, smooth lining without irritating internal seams or nails.",
            "evidence": ""
          },
          {
            "id": "E_s2_5",
            "label": "5",
            "requirement": "Wear resistance: Soles possess adequate grip/tread and materials resist immediate scuffing.",
            "evidence": ""
          }
        ]
      },
      {
        "title": "Facility Readiness & Process Control",
        "checkpoints": [
          {
            "id": "E_s3_1",
            "label": "1",
            "requirement": "A. Facility Layout & Production Flow",
            "evidence": ""
          },
          {
            "id": "E_s3_2",
            "label": "2",
            "requirement": "Workshop layout supports a logical flow (from raw materials to cutting, stitching, assembly, finishing, packaging).",
            "evidence": ""
          },
          {
            "id": "E_s3_3",
            "label": "3",
            "requirement": "Raw material storage is organized, off the ground, and protected from damp/pests.",
            "evidence": ""
          },
          {
            "id": "E_s3_4",
            "label": "4",
            "requirement": "Tools and equipment (sewing machines, cutting tools, lasts) are in good condition and calibrated.",
            "evidence": ""
          },
          {
            "id": "E_s3_5",
            "label": "5",
            "requirement": "Dedicated finishing and inspection area exists with adequate lighting.",
            "evidence": ""
          },
          {
            "id": "E_s3_6",
            "label": "6",
            "requirement": "B. Health, Safety & Housekeeping",
            "evidence": ""
          },
          {
            "id": "E_s3_7",
            "label": "7",
            "requirement": "Fire safety: Extinguishers are present, exits are clear, and flammable adhesives/fabrics are stored safely.",
            "evidence": ""
          },
          {
            "id": "E_s3_8",
            "label": "8",
            "requirement": "Ventilation: Adequate airflow, especially where adhesives, gums, or dyes are used.",
            "evidence": ""
          },
          {
            "id": "E_s3_9",
            "label": "9",
            "requirement": "Housekeeping: Workstations are clear of hazardous debris, needles, and offcuts.",
            "evidence": ""
          },
          {
            "id": "E_s3_10",
            "label": "10",
            "requirement": "Staff Safety/PPE: Workers use appropriate gear (e.g., thimbles, masks for glue fumes, ergonomic seating).",
            "evidence": ""
          },
          {
            "id": "E_s3_11",
            "label": "11",
            "requirement": "C. Quality Management & Records",
            "evidence": ""
          },
          {
            "id": "E_s4_1",
            "label": "1",
            "requirement": "Production records and batch/job tracking documents are actively used.",
            "evidence": ""
          },
          {
            "id": "E_s4_2",
            "label": "2",
            "requirement": "Supplier records exist for raw materials to verify local sourcing claims.",
            "evidence": ""
          },
          {
            "id": "E_s4_3",
            "label": "3",
            "requirement": "In-line and final inspection checkpoints are defined and executed by designated staff.",
            "evidence": ""
          },
          {
            "id": "E_s4_4",
            "label": "4",
            "requirement": "Sample retention system: Gold seals/master samples are kept to ensure consistency.",
            "evidence": ""
          },
          {
            "id": "E_s4_5",
            "label": "5",
            "requirement": "Customer complaint, returns, and defect handling procedures are documented.",
            "evidence": ""
          },
          {
            "id": "E_s4_6",
            "label": "6",
            "requirement": "D. Small-Batch & Handcrafted Specifics",
            "evidence": ""
          },
          {
            "id": "E_s4_7",
            "label": "7",
            "requirement": "Artisan skills are verifiable, and structured training/mentorship records are available.",
            "evidence": ""
          },
          {
            "id": "E_s4_8",
            "label": "8",
            "requirement": "Ethical production: Fair wages are paid, no child labor, acceptable working hours.",
            "evidence": ""
          },
          {
            "id": "E_s4_9",
            "label": "9",
            "requirement": "Standardization: Despite being handmade, mechanisms exist to ensure standard dimensions and aesthetic consistency.",
            "evidence": ""
          }
        ]
      }
    ],
    "preVisitDocs": [],
    "categoryChecks": [],
    "standards": []
  },
  "F": {
    "category": "F",
    "name": "Fish, Meat, Eggs & High-Risk Animal Products",
    "code": "AFZ-QA-HRA",
    "sections": [
      {
        "title": "This audit covers six distinct high-risk product categories. Each category carries its own hazard profile, regulatory requirements, and cold chain obligations. The auditor must tick the applicable category or categories at the start of the audit and ensure all category-specific technical checks are completed for each ticked category.",
        "checkpoints": [
          {
            "id": "F_s0_1",
            "label": "1",
            "requirement": "≤ 4°C (chilled) or live tank",
            "evidence": ""
          },
          {
            "id": "F_s0_2",
            "label": "2",
            "requirement": "0-4°C continuous",
            "evidence": ""
          },
          {
            "id": "F_s0_3",
            "label": "3",
            "requirement": "≤ −18°C continuous",
            "evidence": ""
          },
          {
            "id": "F_s0_4",
            "label": "4",
            "requirement": "Ambient, aw ≤ 0.85",
            "evidence": ""
          },
          {
            "id": "F_s0_5",
            "label": "5",
            "requirement": "Per product type",
            "evidence": ""
          },
          {
            "id": "F_s0_6",
            "label": "6",
            "requirement": "Ambient",
            "evidence": ""
          }
        ]
      },
      {
        "title": "The following documents must be requested from the supplier at least five (5) working days before the audit visit. The auditor must verify authenticity and currency during the desk review and flag any outstanding items in the Opening Meeting.",
        "checkpoints": [
          {
            "id": "F_s1_1",
            "label": "1",
            "requirement": "☐  Microbial & Pathogen Test Reports (Salmonella, Listeria, E. coli)",
            "evidence": ""
          },
          {
            "id": "F_s1_2",
            "label": "2",
            "requirement": "☐  Standard Operating Procedures (SOPs) for processing and handling",
            "evidence": ""
          },
          {
            "id": "F_s1_3",
            "label": "3",
            "requirement": "☐  Calibration Certificates for Temperature-Measuring Equipment",
            "evidence": ""
          },
          {
            "id": "F_s1_4",
            "label": "4",
            "requirement": "☐  Staff Food Safety / Hygiene Training Records",
            "evidence": ""
          },
          {
            "id": "F_s1_5",
            "label": "5",
            "requirement": "☐  Allergen Management Policy & Cross-Contact Controls",
            "evidence": ""
          },
          {
            "id": "F_s1_6",
            "label": "6",
            "requirement": "☐  Finished Product Specifications (organoleptic, microbial, chemical)",
            "evidence": ""
          },
          {
            "id": "F_s1_7",
            "label": "7",
            "requirement": "☐  Export Registrations / AfCFTA or Country-of-Origin Certificates (if applicable)",
            "evidence": ""
          },
          {
            "id": "F_s1_8",
            "label": "8",
            "requirement": "☐  Egg Grading & Flock Health Records (CAT E only)",
            "evidence": ""
          }
        ]
      },
      {
        "title": "A.  Legal & Regulatory Documentation",
        "checkpoints": [
          {
            "id": "F_s2_1",
            "label": "A.1",
            "requirement": "Valid business registration and food processor operating licence in the country of operation.",
            "evidence": "Corporate docs, local authority permits."
          },
          {
            "id": "F_s2_2",
            "label": "A.2",
            "requirement": "Valid NAFDAC or equivalent national food/health regulatory product registration certificates.",
            "evidence": "Original certificates with registration numbers."
          },
          {
            "id": "F_s2_3",
            "label": "A.3",
            "requirement": "Veterinary authority approval (for meat and egg producers) confirming facility is approved for food production.",
            "evidence": "Veterinary authority certification."
          },
          {
            "id": "F_s2_4",
            "label": "A.4",
            "requirement": "Trademark, brand registration, or IP protection for proprietary products.",
            "evidence": "IP registration certificates."
          },
          {
            "id": "F_s2_5",
            "label": "A.5",
            "requirement": "Compliance with applicable export market regulations (EU, UK, US, GCC) where products are destined for export.",
            "evidence": "Export registration documents."
          }
        ]
      },
      {
        "title": "B.  Facility Infrastructure & Zoning",
        "checkpoints": [
          {
            "id": "F_s3_1",
            "label": "B.1",
            "requirement": "Logical unidirectional process flow preventing cross-contamination between raw and cooked/RTE products.",
            "evidence": "Floor plan, visual inspection."
          },
          {
            "id": "F_s3_2",
            "label": "B.2",
            "requirement": "Physical separation between raw material intake, processing, packaging, and finished goods areas.",
            "evidence": "Visual inspection."
          },
          {
            "id": "F_s3_3",
            "label": "B.3",
            "requirement": "Walls, floors, and ceilings are smooth, impervious, light-coloured, and in good structural condition.",
            "evidence": "Visual inspection."
          },
          {
            "id": "F_s3_4",
            "label": "B.4",
            "requirement": "Adequate shatterproof lighting in all production and storage zones.",
            "evidence": "Visual inspection."
          },
          {
            "id": "F_s3_5",
            "label": "B.5",
            "requirement": "Effective temperature management in all processing areas where product is exposed.",
            "evidence": "Temperature probe, visual."
          },
          {
            "id": "F_s3_6",
            "label": "B.6",
            "requirement": "Potable water supply confirmed; water analysis conducted within past 12 months.",
            "evidence": "Water analysis certificate."
          }
        ]
      },
      {
        "title": "C.  Cold Chain Integrity & Temperature Management",
        "checkpoints": [
          {
            "id": "F_s4_1",
            "label": "C.1",
            "requirement": "All refrigeration and freezer units calibrated and operating within defined set-points (chill: 0-4°C; frozen: ≤ −18°C).",
            "evidence": "Calibration certs, live temp reading."
          },
          {
            "id": "F_s4_2",
            "label": "C.2",
            "requirement": "Continuous (automated) temperature data-logging in all cold rooms with at least 90-day data retention.",
            "evidence": "Logger data download / printout."
          },
          {
            "id": "F_s4_3",
            "label": "C.3",
            "requirement": "Documented temperature excursion management procedure; evidence that all historical excursions were investigated and corrected.",
            "evidence": "Deviation log, investigation records."
          },
          {
            "id": "F_s4_4",
            "label": "C.4",
            "requirement": "Cold chain continuity from raw material intake through dispatch; refrigerated vehicles checked before loading.",
            "evidence": "Dispatch records, vehicle logs."
          },
          {
            "id": "F_s4_5",
            "label": "C.5",
            "requirement": "Frozen product shows no signs of partial thawing or re-freezing (no thaw drip, no ice crystal bridging).",
            "evidence": "Visual and physical inspection."
          }
        ]
      },
      {
        "title": "D.  Raw Material Control & Traceability",
        "checkpoints": [
          {
            "id": "F_s5_1",
            "label": "D.1",
            "requirement": "Documented approved supplier list for all animal raw materials with evidence of periodic re-evaluation.",
            "evidence": "Approved Supplier Register."
          },
          {
            "id": "F_s5_2",
            "label": "D.2",
            "requirement": "Intake inspection for freshness, temperature, sensory parameters, and species verification for each delivery.",
            "evidence": "Intake inspection log."
          },
          {
            "id": "F_s5_3",
            "label": "D.3",
            "requirement": "Veterinary residue / antibiotic withdrawal period confirmation for meat and poultry suppliers.",
            "evidence": "Vet certificates, supplier declarations."
          },
          {
            "id": "F_s5_4",
            "label": "D.4",
            "requirement": "Clear batch / lot identification applied at intake and maintained through processing.",
            "evidence": "Batch records, traceability exercise."
          },
          {
            "id": "F_s5_5",
            "label": "D.5",
            "requirement": "One-step-back traceability (to source) and one-step-forward (to customer) demonstrated for any batch.",
            "evidence": "Mock traceability exercise."
          }
        ]
      },
      {
        "title": "E.  Processing, Slaughter & Preparation Controls",
        "checkpoints": [
          {
            "id": "F_s6_1",
            "label": "E.1",
            "requirement": "Slaughter conducted under veterinary or competent authority oversight with ante- and post-mortem inspection.",
            "evidence": "Slaughter records (if applicable)."
          },
          {
            "id": "F_s6_2",
            "label": "E.2",
            "requirement": "Time-temperature control monitored and logged during all processing steps; maximum exposure time defined and enforced.",
            "evidence": "Processing logs, SOPs."
          },
          {
            "id": "F_s6_3",
            "label": "E.3",
            "requirement": "Species/product segregation maintained; no mixing of species or raw/cooked product on shared surfaces.",
            "evidence": "Visual inspection, SOPs."
          },
          {
            "id": "F_s6_4",
            "label": "E.4",
            "requirement": "Smoking process parameters (temperature, time, fuel type) defined and logged for compliance with PAH limits.",
            "evidence": "Smoke process SOPs, PAH test results."
          },
          {
            "id": "F_s6_5",
            "label": "E.5",
            "requirement": "Drying parameters (aw target, drying time, temperature) controlled and verified for each batch.",
            "evidence": "Moisture/aw logs, drying records."
          },
          {
            "id": "F_s6_6",
            "label": "E.6",
            "requirement": "Egg grading, washing, and sanitising procedures documented and compliant with applicable standards.",
            "evidence": "Egg processing SOP."
          }
        ]
      },
      {
        "title": "F.  Hygiene, Sanitation & Pest Control",
        "checkpoints": [
          {
            "id": "F_s7_1",
            "label": "F.1",
            "requirement": "Master cleaning and sanitation schedule documented and validated; records up to date.",
            "evidence": "Cleaning schedule, validation records."
          },
          {
            "id": "F_s7_2",
            "label": "F.2",
            "requirement": "Approved food-safe sanitisers used at correct concentrations; concentration verified and logged.",
            "evidence": "Chemical records, concentration logs."
          },
          {
            "id": "F_s7_3",
            "label": "F.3",
            "requirement": "Environmental monitoring programme (swabs for Listeria/Salmonella) for high-care and RTE zones.",
            "evidence": "Environmental swab results."
          },
          {
            "id": "F_s7_4",
            "label": "F.4",
            "requirement": "Active, contracted pest control programme with monthly service visits, bait station map, and activity log.",
            "evidence": "Pest control contract and logs."
          },
          {
            "id": "F_s7_5",
            "label": "F.5",
            "requirement": "No evidence of pest activity (rodent droppings, insect traps triggered, bird access) inside production areas.",
            "evidence": "Visual inspection."
          },
          {
            "id": "F_s7_6",
            "label": "F.6",
            "requirement": "Waste segregated, contained, and removed at least daily to prevent attraction of pests and cross-contamination.",
            "evidence": "Waste management SOP."
          }
        ]
      },
      {
        "title": "G.  Quality Control & Laboratory Testing",
        "checkpoints": [
          {
            "id": "F_s8_1",
            "label": "G.1",
            "requirement": "Routine microbial testing (TVC, Salmonella, Listeria, E. coli) per product type and defined frequency.",
            "evidence": "Lab reports (COAs) for past 6 months."
          },
          {
            "id": "F_s8_2",
            "label": "G.2",
            "requirement": "Chemical residue testing (veterinary drug residues, pesticides, heavy metals) at documented intervals.",
            "evidence": "Residue test reports."
          },
          {
            "id": "F_s8_3",
            "label": "G.3",
            "requirement": "PAH (polycyclic aromatic hydrocarbon) testing for all smoked fish and meat products.",
            "evidence": "PAH test certificates."
          },
          {
            "id": "F_s8_4",
            "label": "G.4",
            "requirement": "Calibrated, traceable testing equipment (pH meter, aw meter, thermometers); calibration records current.",
            "evidence": "Calibration certificate register."
          },
          {
            "id": "F_s8_5",
            "label": "G.5",
            "requirement": "Positive product release system: no product dispatched without QC sign-off or approved COA.",
            "evidence": "QA release records."
          },
          {
            "id": "F_s8_6",
            "label": "G.6",
            "requirement": "Shelf-life validation studies conducted; results support declared best-before / use-by dates.",
            "evidence": "Shelf-life study data."
          }
        ]
      },
      {
        "title": "H.  Allergen Management",
        "checkpoints": [
          {
            "id": "F_s9_1",
            "label": "H.1",
            "requirement": "Allergen register identifies all allergens present on site, in raw materials, and in finished products.",
            "evidence": "Allergen register."
          },
          {
            "id": "F_s9_2",
            "label": "H.2",
            "requirement": "Allergens are physically segregated during storage and processing; colour-coded equipment used.",
            "evidence": "SOPs, visual inspection."
          },
          {
            "id": "F_s9_3",
            "label": "H.3",
            "requirement": "Allergen cleaning validation conducted after any allergen changeover; records available.",
            "evidence": "Allergen cleaning validation records."
          },
          {
            "id": "F_s9_4",
            "label": "H.4",
            "requirement": "All allergens present in the finished product are declared on the label in compliance with Codex and local regulations.",
            "evidence": "Label artwork review."
          }
        ]
      },
      {
        "title": "I.  Packaging, Labelling & Shelf-Life Control",
        "checkpoints": [
          {
            "id": "F_s10_1",
            "label": "I.1",
            "requirement": "Packaging material is food-grade, compatible with product type, and provides an effective moisture/oxygen barrier.",
            "evidence": "Packaging supplier specs."
          },
          {
            "id": "F_s10_2",
            "label": "I.2",
            "requirement": "Primary packaging integrity is 100% verified (vacuum / MAP / hermetic seals tested per batch).",
            "evidence": "Seal testing records."
          },
          {
            "id": "F_s10_3",
            "label": "I.3",
            "requirement": "Clear batch code, production date, use-by or best-before date legibly printed on primary packaging.",
            "evidence": "Visual inspection of finished packs."
          },
          {
            "id": "F_s10_4",
            "label": "I.4",
            "requirement": "Labels declare: species name, country of origin, net weight, nutritional information, allergens, and storage conditions.",
            "evidence": "Full label review against Codex/NAFDAC."
          },
          {
            "id": "F_s10_5",
            "label": "I.5",
            "requirement": "Species authentication: no mislabelling of fish or meat species (label matches laboratory species ID).",
            "evidence": "Species ID test or certificate."
          },
          {
            "id": "F_s10_6",
            "label": "I.6",
            "requirement": "Product weight / fill accuracy verified; average weight system in place where applicable.",
            "evidence": "Weight check records."
          }
        ]
      },
      {
        "title": "J.  Storage, Warehousing & Dispatch",
        "checkpoints": [
          {
            "id": "F_s11_1",
            "label": "J.1",
            "requirement": "FIFO / FEFO (First In, First Out / First Expired, First Out) rotation enforced across all storage.",
            "evidence": "Storage management SOP, rotation records."
          },
          {
            "id": "F_s11_2",
            "label": "J.2",
            "requirement": "Finished products stored separately from raw materials and packaging components.",
            "evidence": "Visual inspection."
          },
          {
            "id": "F_s11_3",
            "label": "J.3",
            "requirement": "Dispatch documentation includes batch number, quantity, destination, vehicle temperature, and dispatch time.",
            "evidence": "Dispatch records."
          }
        ]
      },
      {
        "title": "K.  Staff Competence, PPE & Training",
        "checkpoints": [
          {
            "id": "F_s12_1",
            "label": "K.1",
            "requirement": "All production staff wear appropriate PPE: hairnets/beard nets, colour-coded aprons, gloves, dedicated footwear.",
            "evidence": "Visual inspection."
          },
          {
            "id": "F_s12_2",
            "label": "K.2",
            "requirement": "Documented food safety, hygiene, and allergen awareness training for all staff; records include date and trainer name.",
            "evidence": "Training matrix and certificates."
          },
          {
            "id": "F_s12_3",
            "label": "K.3",
            "requirement": "Personnel health policy: staff with open wounds, gastro illness, or communicable disease excluded from food handling.",
            "evidence": "Health declaration policy."
          }
        ]
      },
      {
        "title": "L.  Export Readiness, Recall & Standards Alignment",
        "checkpoints": [
          {
            "id": "F_s13_1",
            "label": "L.1",
            "requirement": "Written product recall and withdrawal procedure tested via a documented mock recall exercise.",
            "evidence": "Recall SOP and mock drill record."
          },
          {
            "id": "F_s13_2",
            "label": "L.2",
            "requirement": "Complaint management system with root cause analysis and trend reporting.",
            "evidence": "Complaint log and analysis."
          },
          {
            "id": "F_s13_3",
            "label": "L.3",
            "requirement": "Alignment with Codex Alimentarius Codes of Practice for fish (CAC/RCP 52) and meat (CAC/RCP 58).",
            "evidence": "Policy statement or FSMS documentation."
          },
          {
            "id": "F_s13_4",
            "label": "L.4",
            "requirement": "AfCFTA or destination-market export registrations in place where products are exported.",
            "evidence": "Export registration documents."
          }
        ]
      },
      {
        "title": "Use this table to determine the correct outcome and follow-up pathway based on the final audit score and finding profile. The decision is not discretionary - auditors must apply the criteria below and document any variance with written Head of QA authorisation.",
        "checkpoints": [
          {
            "id": "F_s14_1",
            "label": "1",
            "requirement": "Supplier may list subject to Major CAPA closure within 14 days. Afrizonemart QA performs desk verification of all CAPA evidence. On-site re-audit for Major items at QA discretion.",
            "evidence": ""
          },
          {
            "id": "F_s14_2",
            "label": "2",
            "requirement": "Supplier placed on 60-day improvement programme. No listing until a successful re-audit. All Major and Critical findings must be closed prior to re-audit date.",
            "evidence": ""
          },
          {
            "id": "F_s14_3",
            "label": "3",
            "requirement": "Listing blocked. Formal rejection letter issued within 48 hours. Minimum 90-day remediation period before new application accepted. Re-audit must be full audit (no partial re-audit).",
            "evidence": ""
          },
          {
            "id": "F_s14_4",
            "label": "4",
            "requirement": "All active listings placed on hold. Supplier has 30 days to submit CAPA. Head of QA determines whether expedited re-audit or full removal is appropriate.",
            "evidence": ""
          }
        ]
      }
    ],
    "preVisitDocs": [],
    "categoryChecks": [
      {
        "title": "",
        "items": [
          "Before proceeding with the audit, the auditor must classify each product line being audited using the matrix below. Product form determines which temperature controls, packaging standards, and testing protocols are applicable."
        ]
      }
    ],
    "standards": []
  }
};

export const AUDIT_CATEGORIES: { code: string; name: string }[] = [
  { code: 'A', name: "Flours, Swallows, Cereal & Powdered Staple Foods" },
  { code: 'B', name: "Edible Oils, Functional Botanicals & Infusions" },
  { code: 'C', name: "Snacks, Nuts & Ready-to-Eat Dry Foods" },
  { code: 'D', name: "Cosmetics, Personal Care & Topical Wellness" },
  { code: 'E', name: "Fashion, Footwear & Crafted Lifestyle Products" },
  { code: 'F', name: "Fish, Meat, Eggs & High-Risk Animal Products" },
];

export function getAuditTemplate(category: string): AuditTemplate | null {
  return AUDIT_TEMPLATES[category] ?? null;
}

/** All checkpoint ids for a template (for validation). */
export function templateCheckpointIds(category: string): string[] {
  const t = AUDIT_TEMPLATES[category];
  if (!t) return [];
  return t.sections.flatMap((s) => s.checkpoints.map((c) => c.id));
}
