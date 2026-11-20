import bcrypt from 'bcryptjs';
import { count, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  admissions,
  appointments,
  beds,
  consultations,
  departments,
  diagnoses,
  hospitalServices,
  hospitalSettings,
  inventory,
  invoiceItems,
  invoices,
  laboratoryRequests,
  laboratoryResults,
  laboratoryTests,
  medicalRecords,
  medicines,
  patients,
  payments,
  permissions,
  pharmacyStock,
  prescriptionItems,
  prescriptions,
  rolePermissions,
  roles,
  staffProfiles,
  stockMovements,
  suppliers,
  users,
  wardObservations,
  wards,
} from '../db/schema.ts';
import { ROLE_DEFINITIONS } from '../lib/roles-config.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      console.error('Seed initialization error:', err);
    });
  }
  return seedPromise;
}

async function runSeed() {
  // 1. Seed Roles
  const roleMap = new Map<string, number>();
  for (const r of ROLE_DEFINITIONS) {
    const existing = await db.select().from(roles).where(eq(roles.slug, r.slug)).limit(1);
    if (existing[0]) {
      roleMap.set(r.slug, existing[0].id);
    } else {
      const [inserted] = await db
        .insert(roles)
        .values({ name: r.name, slug: r.slug, description: r.description })
        .returning();
      roleMap.set(r.slug, inserted.id);
    }
  }

  // 2. Seed Permissions
  const permCatalog = [
    { code: 'dashboard:read', name: 'View Dashboard', module: 'dashboard' },
    { code: 'patients:read', name: 'View Patients & Profiles', module: 'patients' },
    { code: 'patients:write', name: 'Register & Edit Patients', module: 'patients' },
    { code: 'appointments:read', name: 'View Appointments', module: 'appointments' },
    { code: 'appointments:manage', name: 'Schedule & Manage Appointments', module: 'appointments' },
    { code: 'consultations:write', name: 'Record Consultations & EMR', module: 'consultations' },
    { code: 'vitals:write', name: 'Record Vital Signs', module: 'consultations' },
    { code: 'admissions:read', name: 'View Wards & Admissions', module: 'admissions' },
    { code: 'admissions:manage', name: 'Admit, Discharge & Ward Notes', module: 'admissions' },
    { code: 'pharmacy:read', name: 'View Medicines & Stock', module: 'pharmacy' },
    { code: 'pharmacy:prescribe', name: 'Prescribe Medicines', module: 'pharmacy' },
    { code: 'pharmacy:manage', name: 'Manage Pharmacy & Dispense', module: 'pharmacy' },
    { code: 'laboratory:read', name: 'View Lab Catalog & Results', module: 'laboratory' },
    { code: 'laboratory:request', name: 'Request Lab Tests', module: 'laboratory' },
    { code: 'laboratory:manage', name: 'Process Lab Tests & Upload Reports', module: 'laboratory' },
    { code: 'billing:read', name: 'View Invoices & Receipts', module: 'billing' },
    { code: 'billing:manage', name: 'Generate Invoices & Record Payments', module: 'billing' },
    { code: 'inventory:read', name: 'View Medical Inventory', module: 'inventory' },
    { code: 'inventory:manage', name: 'Manage Inventory & Procurement', module: 'inventory' },
    { code: 'staff:read', name: 'View Doctors & Staff', module: 'staff' },
    { code: 'staff:manage', name: 'Manage Doctors, Staff & Schedules', module: 'staff' },
    { code: 'reports:read', name: 'View & Export Reports', module: 'reports' },
    { code: 'settings:hospital', name: 'Manage Hospital Services & Settings', module: 'settings' },
    { code: 'settings:manage', name: 'Full System & User Governance', module: 'settings' },
  ];

  const permMap = new Map<string, number>();
  for (const p of permCatalog) {
    const existing = await db.select().from(permissions).where(eq(permissions.code, p.code)).limit(1);
    if (existing[0]) {
      permMap.set(p.code, existing[0].id);
    } else {
      const [inserted] = await db.insert(permissions).values(p).returning();
      permMap.set(p.code, inserted.id);
    }
  }

  const [{ value: rpCount }] = await db.select({ value: count() }).from(rolePermissions);
  if (rpCount === 0) {
    for (const r of ROLE_DEFINITIONS) {
      const rId = roleMap.get(r.slug);
      if (!rId) continue;
      const codes = r.permissions.includes('*') ? permCatalog.map((p) => p.code) : r.permissions;
      for (const code of codes) {
        const pId = permMap.get(code);
        if (pId) {
          await db
            .insert(rolePermissions)
            .values({ roleId: rId, permissionId: pId })
            .onConflictDoNothing();
        }
      }
    }
  }

  // 3. Seed Hospital Settings
  const [{ value: settingsCount }] = await db.select({ value: count() }).from(hospitalSettings);
  if (settingsCount === 0) {
    await db.insert(hospitalSettings).values({
      hospitalName: 'Kamuzu-SmartCare Medical Centre',
      tagline: 'Integrated Clinical & Hospital Operations · Lilongwe',
      phone: '+265 1 774 200',
      email: 'records@smartcarehms.mw',
      address: 'Area 13, Presidential Way, Lilongwe',
      city: 'Lilongwe',
      country: 'Malawi',
      currencyCode: 'MWK',
      currencySymbol: 'MWK',
      taxNumber: 'TPIN-MW-3098421',
      backupSchedule: 'Daily at 02:00 CAT',
    });
  }

  // 4. Seed Departments
  const [{ value: deptCount }] = await db.select({ value: count() }).from(departments);
  if (deptCount > 0) {
    return; // Already seeded operational catalog
  }

  const insertedDepts = await db
    .insert(departments)
    .values([
      {
        name: 'Outpatient & General Medicine',
        code: 'OPD',
        headDoctorName: 'Dr. Chisomo Banda',
        consultationFeeMwk: 15000,
        description: 'Primary clinical consultations, chronic disease clinics, and triage.',
      },
      {
        name: 'Paediatrics & Child Health',
        code: 'PAED',
        headDoctorName: 'Dr. Thandiwe Phiri',
        consultationFeeMwk: 18000,
        description: 'Neonatal care, childhood immunisations, and paediatric acute care.',
      },
      {
        name: 'Obstetrics & Gynaecology',
        code: 'OBGYN',
        headDoctorName: 'Dr. Kondwani Mwale',
        consultationFeeMwk: 22000,
        description: 'Antenatal clinic, maternity ward, and reproductive healthcare.',
      },
      {
        name: 'General Surgery & Theatre',
        code: 'SURG',
        headDoctorName: 'Dr. Dalitso Kamanga',
        consultationFeeMwk: 25000,
        description: 'Elective and emergency surgical procedures and post-operative care.',
      },
      {
        name: 'Internal Medicine & Cardiology',
        code: 'MED',
        headDoctorName: 'Dr. Grace Nyirenda',
        consultationFeeMwk: 25000,
        description: 'Adult inpatient medicine, hypertension, diabetes, and infectious diseases.',
      },
    ])
    .returning();

  const deptByCode = new Map(insertedDepts.map((d) => [d.code, d.id]));

  // 5. Seed Demo Staff Accounts (bcrypt hashed, clearly marked isDemoAccount: true)
  const demoPassHash = await bcrypt.hash('SmartCare@2026', 10);
  const demoUsersSeed = [
    {
      uid: 'demo-sysadmin-01',
      username: 'sysadmin',
      email: 'sysadmin@smartcarehms.mw',
      fullName: 'Limbani Gondwe',
      roleSlug: 'system_admin',
      deptCode: 'OPD',
      phone: '+265 999 101 001',
    },
    {
      uid: 'demo-hospadmin-01',
      username: 'hospadmin',
      email: 'director@smartcarehms.mw',
      fullName: 'Beatrice Nkhoma',
      roleSlug: 'hospital_admin',
      deptCode: 'OPD',
      phone: '+265 999 101 002',
    },
    {
      uid: 'demo-reception-01',
      username: 'reception',
      email: 'reception@smartcarehms.mw',
      fullName: 'Alinafe Tembo',
      roleSlug: 'receptionist',
      deptCode: 'OPD',
      phone: '+265 999 101 003',
    },
    {
      uid: 'demo-doctor-01',
      username: 'dr.banda',
      email: 'c.banda@smartcarehms.mw',
      fullName: 'Dr. Chisomo Banda',
      roleSlug: 'doctor',
      deptCode: 'OPD',
      phone: '+265 999 201 001',
    },
    {
      uid: 'demo-doctor-02',
      username: 'dr.phiri',
      email: 't.phiri@smartcarehms.mw',
      fullName: 'Dr. Thandiwe Phiri',
      roleSlug: 'doctor',
      deptCode: 'PAED',
      phone: '+265 999 201 002',
    },
    {
      uid: 'demo-nurse-01',
      username: 'nurse.chirwa',
      email: 'm.chirwa@smartcarehms.mw',
      fullName: 'Mercy Chirwa, RN',
      roleSlug: 'nurse',
      deptCode: 'MED',
      phone: '+265 999 301 001',
    },
    {
      uid: 'demo-pharm-01',
      username: 'pharm.zulu',
      email: 'p.zulu@smartcarehms.mw',
      fullName: 'Pemphone Zulu, BPharm',
      roleSlug: 'pharmacist',
      deptCode: 'OPD',
      phone: '+265 999 401 001',
    },
    {
      uid: 'demo-lab-01',
      username: 'lab.kachale',
      email: 'k.kachale@smartcarehms.mw',
      fullName: 'Kelvin Kachale, MLS',
      roleSlug: 'lab_technician',
      deptCode: 'MED',
      phone: '+265 999 501 001',
    },
    {
      uid: 'demo-cashier-01',
      username: 'accounts',
      email: 'accounts@smartcarehms.mw',
      fullName: 'Yamikani Mwanza',
      roleSlug: 'accountant',
      deptCode: 'OPD',
      phone: '+265 999 601 001',
    },
  ];

  const userByUsername = new Map<string, number>();
  for (const u of demoUsersSeed) {
    const [inserted] = await db
      .insert(users)
      .values({
        uid: u.uid,
        username: u.username,
        email: u.email,
        passwordHash: demoPassHash,
        fullName: u.fullName,
        roleId: roleMap.get(u.roleSlug) ?? null,
        departmentId: deptByCode.get(u.deptCode) ?? null,
        phone: u.phone,
        isActive: true,
        isDemoAccount: true,
      })
      .returning();
    userByUsername.set(u.username, inserted.id);
  }

  // 6. Seed Staff Profiles (Doctors & Allied Staff)
  const insertedStaff = await db
    .insert(staffProfiles)
    .values([
      {
        userId: userByUsername.get('dr.banda') ?? null,
        staffNumber: 'SC-DOC-001',
        fullName: 'Dr. Chisomo Banda',
        staffType: 'Doctor',
        specialization: 'Family & General Medicine',
        licenseNumber: 'MCM-2018-1142',
        departmentId: deptByCode.get('OPD') ?? null,
        phone: '+265 999 201 001',
        email: 'c.banda@smartcarehms.mw',
        availabilityStatus: 'Available',
        dutySchedule: 'Mon–Fri 07:30–16:30',
        consultationFeeMwk: 15000,
      },
      {
        userId: userByUsername.get('dr.phiri') ?? null,
        staffNumber: 'SC-DOC-002',
        fullName: 'Dr. Thandiwe Phiri',
        staffType: 'Doctor',
        specialization: 'Paediatrics & Neonatology',
        licenseNumber: 'MCM-2019-2088',
        departmentId: deptByCode.get('PAED') ?? null,
        phone: '+265 999 201 002',
        email: 't.phiri@smartcarehms.mw',
        availabilityStatus: 'Available',
        dutySchedule: 'Mon–Fri 08:00–17:00',
        consultationFeeMwk: 18000,
      },
      {
        userId: null,
        staffNumber: 'SC-DOC-003',
        fullName: 'Dr. Kondwani Mwale',
        staffType: 'Doctor',
        specialization: 'Obstetrics & Gynaecology',
        licenseNumber: 'MCM-2016-0914',
        departmentId: deptByCode.get('OBGYN') ?? null,
        phone: '+265 999 201 003',
        email: 'k.mwale@smartcarehms.mw',
        availabilityStatus: 'On Duty',
        dutySchedule: 'Tue–Sat 08:00–17:00',
        consultationFeeMwk: 22000,
      },
      {
        userId: null,
        staffNumber: 'SC-DOC-004',
        fullName: 'Dr. Grace Nyirenda',
        staffType: 'Doctor',
        specialization: 'Internal Medicine',
        licenseNumber: 'MCM-2015-0512',
        departmentId: deptByCode.get('MED') ?? null,
        phone: '+265 999 201 004',
        email: 'g.nyirenda@smartcarehms.mw',
        availabilityStatus: 'In Consultation',
        dutySchedule: 'Mon–Fri 08:00–16:00',
        consultationFeeMwk: 25000,
      },
      {
        userId: userByUsername.get('nurse.chirwa') ?? null,
        staffNumber: 'SC-NUR-001',
        fullName: 'Mercy Chirwa, RN',
        staffType: 'Nurse',
        specialization: 'Inpatient Ward Nursing',
        licenseNumber: 'NMCM-2020-4410',
        departmentId: deptByCode.get('MED') ?? null,
        phone: '+265 999 301 001',
        email: 'm.chirwa@smartcarehms.mw',
        availabilityStatus: 'On Duty',
        dutySchedule: 'Shift A · 07:00–19:00',
        consultationFeeMwk: 0,
      },
      {
        userId: userByUsername.get('pharm.zulu') ?? null,
        staffNumber: 'SC-PHM-001',
        fullName: 'Pemphone Zulu, BPharm',
        staffType: 'Pharmacist',
        specialization: 'Clinical Pharmacy',
        licenseNumber: 'PMRA-2019-0318',
        departmentId: deptByCode.get('OPD') ?? null,
        phone: '+265 999 401 001',
        email: 'p.zulu@smartcarehms.mw',
        availabilityStatus: 'Available',
        dutySchedule: 'Mon–Sat 08:00–17:00',
        consultationFeeMwk: 0,
      },
      {
        userId: userByUsername.get('lab.kachale') ?? null,
        staffNumber: 'SC-LAB-001',
        fullName: 'Kelvin Kachale, MLS',
        staffType: 'Lab Technician',
        specialization: 'Haematology & Microbiology',
        licenseNumber: 'MCM-MLS-2021-077',
        departmentId: deptByCode.get('MED') ?? null,
        phone: '+265 999 501 001',
        email: 'k.kachale@smartcarehms.mw',
        availabilityStatus: 'On Duty',
        dutySchedule: 'Mon–Fri 07:30–16:30',
        consultationFeeMwk: 0,
      },
    ])
    .returning();

  const drBanda = insertedStaff[0];
  const drPhiri = insertedStaff[1];
  const drNyirenda = insertedStaff[3];

  // 7. Seed Wards & Beds
  const insertedWards = await db
    .insert(wards)
    .values([
      {
        name: 'Chisomo General Medical Ward',
        wardType: 'General Medical',
        departmentId: deptByCode.get('MED') ?? null,
        dailyRateMwk: 28000,
        capacity: 6,
      },
      {
        name: 'Lilongwe Maternity & Antenatal Wing',
        wardType: 'Maternity',
        departmentId: deptByCode.get('OBGYN') ?? null,
        dailyRateMwk: 35000,
        capacity: 4,
      },
      {
        name: 'Paediatric Observation Ward',
        wardType: 'Paediatric',
        departmentId: deptByCode.get('PAED') ?? null,
        dailyRateMwk: 25000,
        capacity: 4,
      },
      {
        name: 'Executive Private Suites',
        wardType: 'Private',
        departmentId: deptByCode.get('MED') ?? null,
        dailyRateMwk: 75000,
        capacity: 3,
      },
    ])
    .returning();

  const bedInserts: { wardId: number; bedNumber: string; status: string }[] = [];
  for (const w of insertedWards) {
    const prefix = w.wardType.slice(0, 3).toUpperCase();
    for (let i = 1; i <= w.capacity; i++) {
      bedInserts.push({
        wardId: w.id,
        bedNumber: `${prefix}-B0${i}`,
        status: i === 2 && w.wardType === 'Maternity' ? 'Reserved' : 'Available',
      });
    }
  }
  const insertedBeds = await db.insert(beds).values(bedInserts).returning();

  // 8. Seed Suppliers, Medicines, Pharmacy Stock, Inventory
  const insertedSuppliers = await db
    .insert(suppliers)
    .values([
      {
        name: 'Central Medical Stores Trust (CMST)',
        contactPerson: 'Chikondi Msiska',
        phone: '+265 1 752 800',
        email: 'orders@cmst.mw',
        address: 'Mzimba Street, Lilongwe',
        supplierType: 'Pharmaceutical & Medical',
      },
      {
        name: 'Pharmanova Malawi Ltd',
        contactPerson: 'Sibusiso Moyo',
        phone: '+265 1 871 420',
        email: 'supply@pharmanova.mw',
        address: 'Ginnery Corner, Blantyre',
        supplierType: 'Pharmaceuticals',
      },
      {
        name: 'Malawi MedEquip & Diagnostics',
        contactPerson: 'Tiwonge Kanyenda',
        phone: '+265 888 412 900',
        email: 'sales@medequip.mw',
        address: 'Area 4, Lilongwe',
        supplierType: 'Lab Reagents & Equipment',
      },
    ])
    .returning();

  const insertedMeds = await db
    .insert(medicines)
    .values([
      {
        medicineName: 'Lumefantrine / Artemether (LA)',
        genericName: 'Artemether-Lumefantrine 20/120mg',
        category: 'Antimalarial',
        dosageForm: 'Tablet',
        strength: '20mg/120mg',
        unitPriceMwk: 3500,
        reorderLevel: 80,
      },
      {
        medicineName: 'Amoxicillin 500mg',
        genericName: 'Amoxicillin Trihydrate',
        category: 'Antibiotic',
        dosageForm: 'Capsule',
        strength: '500mg',
        unitPriceMwk: 450,
        reorderLevel: 120,
      },
      {
        medicineName: 'Paracetamol 500mg',
        genericName: 'Acetaminophen',
        category: 'Analgesic / Antipyretic',
        dosageForm: 'Tablet',
        strength: '500mg',
        unitPriceMwk: 150,
        reorderLevel: 200,
      },
      {
        medicineName: 'Amlodipine 5mg',
        genericName: 'Amlodipine Besylate',
        category: 'Antihypertensive',
        dosageForm: 'Tablet',
        strength: '5mg',
        unitPriceMwk: 650,
        reorderLevel: 60,
      },
      {
        medicineName: 'Metformin 500mg',
        genericName: 'Metformin Hydrochloride',
        category: 'Antidiabetic',
        dosageForm: 'Tablet',
        strength: '500mg',
        unitPriceMwk: 400,
        reorderLevel: 100,
      },
      {
        medicineName: 'Ceftriaxone 1g IV',
        genericName: 'Ceftriaxone Sodium',
        category: 'Antibiotic',
        dosageForm: 'Injection',
        strength: '1g',
        unitPriceMwk: 4800,
        reorderLevel: 40,
      },
    ])
    .returning();

  await db.insert(pharmacyStock).values([
    {
      medicineId: insertedMeds[0].id,
      batchNumber: 'LA-2026-091',
      quantity: 240,
      expiryDate: '2027-08-31',
      supplierId: insertedSuppliers[0].id,
      purchasePriceMwk: 2600,
    },
    {
      medicineId: insertedMeds[1].id,
      batchNumber: 'AMX-2026-114',
      quantity: 480,
      expiryDate: '2027-04-30',
      supplierId: insertedSuppliers[1].id,
      purchasePriceMwk: 310,
    },
    {
      medicineId: insertedMeds[2].id,
      batchNumber: 'PCM-2026-205',
      quantity: 850,
      expiryDate: '2028-01-15',
      supplierId: insertedSuppliers[0].id,
      purchasePriceMwk: 90,
    },
    {
      medicineId: insertedMeds[3].id,
      batchNumber: 'AML-2026-042',
      quantity: 140,
      expiryDate: '2027-06-30',
      supplierId: insertedSuppliers[1].id,
      purchasePriceMwk: 450,
    },
    {
      medicineId: insertedMeds[4].id,
      batchNumber: 'MET-2026-088',
      quantity: 95,
      expiryDate: '2026-12-20',
      supplierId: insertedSuppliers[1].id,
      purchasePriceMwk: 280,
    },
    {
      medicineId: insertedMeds[5].id,
      batchNumber: 'CEF-2026-019',
      quantity: 28,
      expiryDate: '2027-02-28',
      supplierId: insertedSuppliers[0].id,
      purchasePriceMwk: 3500,
    },
  ]);

  await db.insert(inventory).values([
    {
      itemCode: 'INV-PPE-001',
      name: 'Nitrile Examination Gloves (Box of 100)',
      category: 'PPE',
      quantity: 64,
      unit: 'Boxes',
      reorderLevel: 25,
      unitCostMwk: 14500,
      expiryDate: '2028-05-01',
      supplierId: insertedSuppliers[2].id,
      location: 'Central Medical Store',
    },
    {
      itemCode: 'INV-CON-002',
      name: 'Sterile IV Cannula 20G',
      category: 'Consumables',
      quantity: 180,
      unit: 'Pieces',
      reorderLevel: 50,
      unitCostMwk: 950,
      expiryDate: '2028-09-30',
      supplierId: insertedSuppliers[0].id,
      location: 'Ward & Emergency Store',
    },
    {
      itemCode: 'INV-LAB-003',
      name: 'Malaria Rapid Diagnostic Test (RDT) Kits',
      category: 'Laboratory Reagents',
      quantity: 16,
      unit: 'Packs',
      reorderLevel: 20,
      unitCostMwk: 22000,
      expiryDate: '2027-01-31',
      supplierId: insertedSuppliers[2].id,
      location: 'Laboratory Store',
    },
  ]);

  // 9. Seed Laboratory Tests & Hospital Services
  const insertedLabTests = await db
    .insert(laboratoryTests)
    .values([
      {
        testCode: 'LAB-FBC',
        testName: 'Full Blood Count (FBC)',
        category: 'Haematology',
        priceMwk: 12000,
        normalRange: 'WBC 4.0-11.0 x10^9/L · Hb 12.0-16.5 g/dL',
        turnaroundHours: 2,
      },
      {
        testCode: 'LAB-MRDT',
        testName: 'Malaria Parasite Smear & mRDT',
        category: 'Parasitology',
        priceMwk: 6500,
        normalRange: 'Negative (No malaria parasites seen)',
        turnaroundHours: 1,
      },
      {
        testCode: 'LAB-FBS',
        testName: 'Fasting Blood Glucose',
        category: 'Biochemistry',
        priceMwk: 7500,
        normalRange: '3.9 - 5.5 mmol/L',
        turnaroundHours: 1,
      },
      {
        testCode: 'LAB-LFT',
        testName: 'Liver Function Panel (LFT)',
        category: 'Biochemistry',
        priceMwk: 24000,
        normalRange: 'ALT < 40 U/L · AST < 40 U/L',
        turnaroundHours: 4,
      },
      {
        testCode: 'LAB-URINE',
        testName: 'Urinalysis & Microscopy',
        category: 'Urinalysis',
        priceMwk: 5500,
        normalRange: 'Clear, pH 5.0-7.5, Negative glucose/protein',
        turnaroundHours: 2,
      },
    ])
    .returning();

  await db.insert(hospitalServices).values([
    {
      name: 'General Outpatient Consultation',
      category: 'Consultation',
      departmentId: deptByCode.get('OPD') ?? null,
      priceMwk: 15000,
    },
    {
      name: 'Specialist Paediatric Consultation',
      category: 'Consultation',
      departmentId: deptByCode.get('PAED') ?? null,
      priceMwk: 18000,
    },
    {
      name: 'Wound Dressing & Suturing',
      category: 'Procedure',
      departmentId: deptByCode.get('SURG') ?? null,
      priceMwk: 12500,
    },
    {
      name: 'Antenatal Ultrasound Scan',
      category: 'Imaging',
      departmentId: deptByCode.get('OBGYN') ?? null,
      priceMwk: 25000,
    },
  ]);

  // 10. Seed Realistic Demo Patients (clearly marked isDemoRecord: true)
  const todayStr = new Date().toISOString().slice(0, 10);
  const demoPatients = await db
    .insert(patients)
    .values([
      {
        patientNumber: 'MW-2026-0001',
        fullName: 'Chifundo Mkandawire',
        dateOfBirth: '1988-04-14',
        gender: 'Female',
        phone: '+265 999 812 301',
        residentialAddress: 'Area 47, Sector 3, Lilongwe',
        emergencyContactName: 'Tadala Mkandawire',
        emergencyContactPhone: '+265 999 812 302',
        nextOfKinName: 'Tadala Mkandawire',
        nextOfKinRelationship: 'Spouse',
        nextOfKinPhone: '+265 999 812 302',
        bloodGroup: 'O+',
        allergies: 'Penicillin (mild rash)',
        medicalHistory: 'Hypertension diagnosed 2023, well controlled on Amlodipine.',
        isDemoRecord: true,
      },
      {
        patientNumber: 'MW-2026-0002',
        fullName: 'Yamikani Chavula',
        dateOfBirth: '1979-11-02',
        gender: 'Male',
        phone: '+265 888 340 112',
        residentialAddress: 'Area 18A, Lilongwe',
        emergencyContactName: 'Grace Chavula',
        emergencyContactPhone: '+265 888 340 119',
        nextOfKinName: 'Grace Chavula',
        nextOfKinRelationship: 'Wife',
        nextOfKinPhone: '+265 888 340 119',
        bloodGroup: 'A+',
        allergies: 'None known',
        medicalHistory: 'Type 2 Diabetes Mellitus, regular OPD follow-up.',
        isDemoRecord: true,
      },
      {
        patientNumber: 'MW-2026-0003',
        fullName: 'Tamala Mbewe',
        dateOfBirth: '2020-07-22',
        gender: 'Female',
        phone: '+265 995 621 440',
        residentialAddress: 'Kawale 2, Lilongwe',
        emergencyContactName: 'Esther Mbewe',
        emergencyContactPhone: '+265 995 621 440',
        nextOfKinName: 'Esther Mbewe',
        nextOfKinRelationship: 'Mother',
        nextOfKinPhone: '+265 995 621 440',
        bloodGroup: 'B+',
        allergies: 'None known',
        medicalHistory: 'Up to date with EPI immunisations.',
        isDemoRecord: true,
      },
      {
        patientNumber: 'MW-2026-0004',
        fullName: 'Pemphero Kaunda',
        dateOfBirth: '1994-01-30',
        gender: 'Male',
        phone: '+265 991 209 554',
        residentialAddress: 'Area 25, Lilongwe',
        emergencyContactName: 'Dumisani Kaunda',
        emergencyContactPhone: '+265 991 209 555',
        nextOfKinName: 'Dumisani Kaunda',
        nextOfKinRelationship: 'Brother',
        nextOfKinPhone: '+265 991 209 555',
        bloodGroup: 'O-',
        allergies: 'Sulfa drugs',
        medicalHistory: 'No chronic illnesses.',
        isDemoRecord: true,
      },
    ])
    .returning();

  // 11. Seed Appointments for today
  const insertedAppts = await db
    .insert(appointments)
    .values([
      {
        appointmentNumber: 'APT-2026-0001',
        patientId: demoPatients[0].id,
        doctorId: drBanda.id,
        departmentId: deptByCode.get('OPD')!,
        appointmentDate: todayStr,
        appointmentTime: '09:00',
        reason: 'Hypertension review & blood pressure check',
        status: 'Completed',
        attendanceRecordedAt: new Date(),
      },
      {
        appointmentNumber: 'APT-2026-0002',
        patientId: demoPatients[1].id,
        doctorId: drNyirenda.id,
        departmentId: deptByCode.get('MED')!,
        appointmentDate: todayStr,
        appointmentTime: '10:30',
        reason: 'Glycaemic review & fasting glucose follow-up',
        status: 'Checked in',
        attendanceRecordedAt: new Date(),
      },
      {
        appointmentNumber: 'APT-2026-0003',
        patientId: demoPatients[2].id,
        doctorId: drPhiri.id,
        departmentId: deptByCode.get('PAED')!,
        appointmentDate: todayStr,
        appointmentTime: '11:30',
        reason: 'High fever and cough x2 days',
        status: 'Confirmed',
      },
      {
        appointmentNumber: 'APT-2026-0004',
        patientId: demoPatients[3].id,
        doctorId: drBanda.id,
        departmentId: deptByCode.get('OPD')!,
        appointmentDate: todayStr,
        appointmentTime: '14:00',
        reason: 'General medical check-up',
        status: 'Scheduled',
      },
    ])
    .returning();

  // 12. Seed Consultation, Prescription, Lab Request, Admission, Invoice & Payment
  const [consult1] = await db
    .insert(consultations)
    .values({
      consultationNumber: 'CON-2026-0001',
      patientId: demoPatients[0].id,
      doctorId: drBanda.id,
      appointmentId: insertedAppts[0].id,
      departmentId: deptByCode.get('OPD')!,
      chiefComplaints: 'Routine hypertension follow-up, mild occipital headache.',
      symptoms: 'No chest pain, no visual changes.',
      vitalTempC: '36.7',
      vitalBp: '138/86',
      vitalPulseBpm: 76,
      vitalRespRate: 16,
      vitalSpo2: 98,
      vitalWeightKg: '68.5',
      clinicalNotes: 'Continue Amlodipine 5mg OD, reinforce low-salt diet and daily walking.',
      diagnosis: 'Essential Hypertension (Controlled)',
      icdCode: 'I10',
      treatmentPlan: '30-day refill Amlodipine 5mg OD + FBC baseline.',
      isLocked: true,
    })
    .returning();

  await db.insert(diagnoses).values({
    consultationId: consult1.id,
    patientId: demoPatients[0].id,
    code: 'I10',
    description: 'Essential (primary) hypertension',
    severity: 'Mild',
    isPrimary: true,
  });

  await db.insert(medicalRecords).values({
    patientId: demoPatients[0].id,
    recordType: 'Consultation',
    referenceId: consult1.id,
    summary: 'OPD Consultation · Essential Hypertension (I10)',
    details: 'BP 138/86 mmHg, Pulse 76 bpm. Refilled Amlodipine 5mg OD.',
    recordedByName: drBanda.fullName,
  });

  const [rx1] = await db
    .insert(prescriptions)
    .values({
      prescriptionNumber: 'RX-2026-0001',
      consultationId: consult1.id,
      patientId: demoPatients[0].id,
      doctorId: drBanda.id,
      status: 'Pending',
      notes: 'Dispense 30-day hypertension maintenance supply.',
    })
    .returning();

  await db.insert(prescriptionItems).values({
    prescriptionId: rx1.id,
    medicineId: insertedMeds[3].id,
    dosage: '5mg',
    frequency: 'Once daily',
    duration: '30 days',
    quantityPrescribed: 30,
    quantityDispensed: 0,
    instructions: 'Take every morning with water.',
  });

  const [labReq1] = await db
    .insert(laboratoryRequests)
    .values({
      requestNumber: 'LAB-2026-0001',
      patientId: demoPatients[2].id,
      doctorId: drPhiri.id,
      testId: insertedLabTests[1].id,
      priority: 'Urgent',
      status: 'Sample collected',
      clinicalNotes: 'Febrile paediatric patient — rule out malaria.',
    })
    .returning();

  const [labReq2] = await db
    .insert(laboratoryRequests)
    .values({
      requestNumber: 'LAB-2026-0002',
      patientId: demoPatients[1].id,
      doctorId: drNyirenda.id,
      testId: insertedLabTests[2].id,
      priority: 'Routine',
      status: 'Completed',
      clinicalNotes: 'Routine diabetic glycaemic check.',
      completedAt: new Date(),
    })
    .returning();

  await db.insert(laboratoryResults).values({
    requestId: labReq2.id,
    patientId: demoPatients[1].id,
    resultSummary: 'Fasting Blood Glucose slightly elevated',
    measuredValue: '6.8 mmol/L',
    referenceRange: '3.9 - 5.5 mmol/L',
    interpretation: 'Abnormal',
    technicianNotes: 'Verified on Mindray BS-240 chemistry analyser.',
  });

  // Admit patient 4 to Chisomo General Medical Ward Bed 1
  const genMedBed1 = insertedBeds.find((b) => b.wardId === insertedWards[0].id)!;
  const [adm1] = await db
    .insert(admissions)
    .values({
      admissionNumber: 'ADM-2026-0001',
      patientId: demoPatients[3].id,
      wardId: insertedWards[0].id,
      bedId: genMedBed1.id,
      admittingDoctorId: drNyirenda.id,
      admissionReason: 'Acute febrile illness & IV rehydration monitoring',
      status: 'Admitted',
    })
    .returning();

  await db
    .update(beds)
    .set({ status: 'Occupied', currentAdmissionId: adm1.id })
    .where(eq(beds.id, genMedBed1.id));

  await db.insert(wardObservations).values({
    admissionId: adm1.id,
    patientId: demoPatients[3].id,
    recordedByName: 'Mercy Chirwa, RN',
    tempC: '37.8',
    bloodPressure: '118/74',
    pulseBpm: 88,
    respiratoryRate: 18,
    spo2: 97,
    nursingNote: 'Patient alert and comfortable. IV Normal Saline 500ml running well.',
  });

  // Seed Invoices & Payments (MWK)
  const [inv1] = await db
    .insert(invoices)
    .values({
      invoiceNumber: 'INV-2026-0001',
      patientId: demoPatients[0].id,
      departmentId: deptByCode.get('OPD')!,
      totalAmountMwk: 34500,
      paidAmountMwk: 34500,
      balanceMwk: 0,
      status: 'Paid',
      dueDate: todayStr,
      notes: 'OPD Consultation + Amlodipine 30-day supply',
    })
    .returning();

  await db.insert(invoiceItems).values([
    {
      invoiceId: inv1.id,
      category: 'Consultation',
      description: 'OPD Consultation — Dr. Chisomo Banda',
      quantity: 1,
      unitPriceMwk: 15000,
      totalPriceMwk: 15000,
    },
    {
      invoiceId: inv1.id,
      category: 'Pharmacy',
      description: 'Amlodipine 5mg Tablets (x30)',
      quantity: 30,
      unitPriceMwk: 650,
      totalPriceMwk: 19500,
    },
  ]);

  await db.insert(payments).values({
    receiptNumber: 'RCP-2026-0001',
    invoiceId: inv1.id,
    patientId: demoPatients[0].id,
    amountMwk: 34500,
    paymentMethod: 'Mobile money',
    referenceNumber: 'MPAMBA-8829104',
    notes: 'Paid in full via TNM Mpamba',
  });

  const [inv2] = await db
    .insert(invoices)
    .values({
      invoiceNumber: 'INV-2026-0002',
      patientId: demoPatients[1].id,
      departmentId: deptByCode.get('MED')!,
      totalAmountMwk: 32500,
      paidAmountMwk: 15000,
      balanceMwk: 17500,
      status: 'Partial',
      dueDate: todayStr,
      notes: 'Specialist Consultation + Fasting Blood Glucose',
    })
    .returning();

  await db.insert(invoiceItems).values([
    {
      invoiceId: inv2.id,
      category: 'Consultation',
      description: 'Internal Medicine Specialist Consultation',
      quantity: 1,
      unitPriceMwk: 25000,
      totalPriceMwk: 25000,
    },
    {
      invoiceId: inv2.id,
      category: 'Laboratory',
      description: 'Fasting Blood Glucose',
      quantity: 1,
      unitPriceMwk: 7500,
      totalPriceMwk: 7500,
    },
  ]);

  await db.insert(payments).values({
    receiptNumber: 'RCP-2026-0002',
    invoiceId: inv2.id,
    patientId: demoPatients[1].id,
    amountMwk: 15000,
    paymentMethod: 'Cash',
    referenceNumber: 'CASH-DESK-02',
    notes: 'Deposit payment at cashier desk',
  });

  await db.insert(stockMovements).values({
    itemType: 'Medicine',
    medicineId: insertedMeds[0].id,
    movementType: 'Purchase',
    quantityDelta: 240,
    referenceNote: 'Initial CMST delivery Batch LA-2026-091',
  });
}
