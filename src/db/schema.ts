import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// 1. Roles & Permissions
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  module: text('module').notNull(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: serial('id').primaryKey(),
    roleId: integer('role_id')
      .references(() => roles.id, { onDelete: 'cascade' })
      .notNull(),
    permissionId: integer('permission_id')
      .references(() => permissions.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [
    uniqueIndex('role_perm_unique_idx').on(table.roleId, table.permissionId),
  ]
);

// 2. Departments
export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  code: text('code').notNull().unique(),
  headDoctorName: text('head_doctor_name'),
  consultationFeeMwk: integer('consultation_fee_mwk').default(15000).notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Users & Sessions
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    username: text('username').unique(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'),
    fullName: text('full_name').notNull(),
    roleId: integer('role_id').references(() => roles.id),
    departmentId: integer('department_id').references(() => departments.id),
    phone: text('phone'),
    isActive: boolean('is_active').default(true).notNull(),
    isDemoAccount: boolean('is_demo_account').default(false).notNull(),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('users_role_idx').on(table.roleId)]
);

export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)]
);

// 4. Doctors & Staff
export const staffProfiles = pgTable(
  'staff_profiles',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    staffNumber: text('staff_number').notNull().unique(),
    fullName: text('full_name').notNull(),
    staffType: text('staff_type').notNull(),
    specialization: text('specialization'),
    licenseNumber: text('license_number'),
    departmentId: integer('department_id').references(() => departments.id),
    phone: text('phone').notNull(),
    email: text('email'),
    availabilityStatus: text('availability_status').default('Available').notNull(),
    dutySchedule: text('duty_schedule').default('Mon-Fri 07:30-16:30'),
    consultationFeeMwk: integer('consultation_fee_mwk').default(15000).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('staff_type_idx').on(table.staffType),
    index('staff_dept_idx').on(table.departmentId),
  ]
);

// 5. Patients & Documents
export const patients = pgTable(
  'patients',
  {
    id: serial('id').primaryKey(),
    patientNumber: text('patient_number').notNull().unique(),
    fullName: text('full_name').notNull(),
    dateOfBirth: text('date_of_birth').notNull(),
    gender: text('gender').notNull(),
    phone: text('phone').notNull(),
    residentialAddress: text('residential_address').notNull(),
    emergencyContactName: text('emergency_contact_name').notNull(),
    emergencyContactPhone: text('emergency_contact_phone').notNull(),
    nextOfKinName: text('next_of_kin_name').notNull(),
    nextOfKinRelationship: text('next_of_kin_relationship'),
    nextOfKinPhone: text('next_of_kin_phone'),
    bloodGroup: text('blood_group').default('Unknown'),
    allergies: text('allergies').default('None known'),
    medicalHistory: text('medical_history'),
    isDemoRecord: boolean('is_demo_record').default(false).notNull(),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('patients_name_idx').on(table.fullName),
    index('patients_phone_idx').on(table.phone),
  ]
);

export const patientDocuments = pgTable(
  'patient_documents',
  {
    id: serial('id').primaryKey(),
    patientId: integer('patient_id')
      .references(() => patients.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    documentType: text('document_type').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileDataBase64: text('file_data_base64').notNull(),
    uploadedByUserId: integer('uploaded_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('patient_docs_patient_idx').on(table.patientId)]
);

// 6. Appointments
export const appointments = pgTable(
  'appointments',
  {
    id: serial('id').primaryKey(),
    appointmentNumber: text('appointment_number').notNull().unique(),
    patientId: integer('patient_id')
      .references(() => patients.id)
      .notNull(),
    doctorId: integer('doctor_id')
      .references(() => staffProfiles.id)
      .notNull(),
    departmentId: integer('department_id')
      .references(() => departments.id)
      .notNull(),
    appointmentDate: text('appointment_date').notNull(),
    appointmentTime: text('appointment_time').notNull(),
    durationMinutes: integer('duration_minutes').default(30).notNull(),
    reason: text('reason').notNull(),
    status: text('status').default('Scheduled').notNull(),
    attendanceRecordedAt: timestamp('attendance_recorded_at'),
    notes: text('notes'),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('appt_date_idx').on(table.appointmentDate),
    index('appt_doctor_idx').on(table.doctorId),
    index('appt_patient_idx').on(table.patientId),
  ]
);

// 7. Consultations, Diagnoses & Medical Records (EMR)
export const consultations = pgTable(
  'consultations',
  {
    id: serial('id').primaryKey(),
    consultationNumber: text('consultation_number').notNull().unique(),
    patientId: integer('patient_id')
      .references(() => patients.id)
      .notNull(),
    doctorId: integer('doctor_id')
      .references(() => staffProfiles.id)
      .notNull(),
    appointmentId: integer('appointment_id').references(() => appointments.id),
    departmentId: integer('department_id').references(() => departments.id),
    chiefComplaints: text('chief_complaints').notNull(),
    symptoms: text('symptoms'),
    vitalTempC: text('vital_temp_c'),
    vitalBp: text('vital_bp'),
    vitalPulseBpm: integer('vital_pulse_bpm'),
    vitalRespRate: integer('vital_resp_rate'),
    vitalSpo2: integer('vital_spo2'),
    vitalWeightKg: text('vital_weight_kg'),
    clinicalNotes: text('clinical_notes'),
    diagnosis: text('diagnosis').notNull(),
    icdCode: text('icd_code'),
    treatmentPlan: text('treatment_plan'),
    followUpDate: text('follow_up_date'),
    isLocked: boolean('is_locked').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('consult_patient_idx').on(table.patientId),
    index('consult_doctor_idx').on(table.doctorId),
  ]
);

export const diagnoses = pgTable(
  'diagnoses',
  {
    id: serial('id').primaryKey(),
    consultationId: integer('consultation_id')
      .references(() => consultations.id, { onDelete: 'cascade' })
      .notNull(),
    patientId: integer('patient_id')
      .references(() => patients.id)
      .notNull(),
    code: text('code'),
    description: text('description').notNull(),
    severity: text('severity').default('Moderate').notNull(),
    isPrimary: boolean('is_primary').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('diagnoses_patient_idx').on(table.patientId)]
);

export const medicalRecords = pgTable(
  'medical_records',
  {
    id: serial('id').primaryKey(),
    patientId: integer('patient_id')
      .references(() => patients.id)
      .notNull(),
    recordType: text('record_type').notNull(),
    referenceId: integer('reference_id'),
    summary: text('summary').notNull(),
    details: text('details'),
    recordedByUserId: integer('recorded_by_user_id').references(() => users.id),
    recordedByName: text('recorded_by_name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('med_records_patient_idx').on(table.patientId)]
);

// 8. Wards, Beds, Admissions & Observations
export const wards = pgTable('wards', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  wardType: text('ward_type').notNull(),
  departmentId: integer('department_id').references(() => departments.id),
  dailyRateMwk: integer('daily_rate_mwk').default(25000).notNull(),
  capacity: integer('capacity').default(10).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const beds = pgTable(
  'beds',
  {
    id: serial('id').primaryKey(),
    wardId: integer('ward_id')
      .references(() => wards.id, { onDelete: 'cascade' })
      .notNull(),
    bedNumber: text('bed_number').notNull(),
    status: text('status').default('Available').notNull(),
    currentAdmissionId: integer('current_admission_id'),
  },
  (table) => [
    uniqueIndex('ward_bed_unique_idx').on(table.wardId, table.bedNumber),
  ]
);

export const admissions = pgTable(
  'admissions',
  {
    id: serial('id').primaryKey(),
    admissionNumber: text('admission_number').notNull().unique(),
    patientId: integer('patient_id')
      .references(() => patients.id)
      .notNull(),
    wardId: integer('ward_id')
      .references(() => wards.id)
      .notNull(),
    bedId: integer('bed_id')
      .references(() => beds.id)
      .notNull(),
    admittingDoctorId: integer('admitting_doctor_id')
      .references(() => staffProfiles.id)
      .notNull(),
    admissionDate: timestamp('admission_date').defaultNow().notNull(),
    dischargeDate: timestamp('discharge_date'),
    admissionReason: text('admission_reason').notNull(),
    status: text('status').default('Admitted').notNull(),
    dischargeSummary: text('discharge_summary'),
    dischargeCondition: text('discharge_condition'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('admissions_patient_idx').on(table.patientId),
    index('admissions_status_idx').on(table.status),
  ]
);

export const wardObservations = pgTable(
  'ward_observations',
  {
    id: serial('id').primaryKey(),
    admissionId: integer('admission_id').references(() => admissions.id),
    patientId: integer('patient_id')
      .references(() => patients.id)
      .notNull(),
    recordedByUserId: integer('recorded_by_user_id').references(() => users.id),
    recordedByName: text('recorded_by_name').notNull(),
    tempC: text('temp_c'),
    bloodPressure: text('blood_pressure'),
    pulseBpm: integer('pulse_bpm'),
    respiratoryRate: integer('respiratory_rate'),
    spo2: integer('spo2'),
    nursingNote: text('nursing_note').notNull(),
    observedAt: timestamp('observed_at').defaultNow().notNull(),
  },
  (table) => [index('obs_patient_idx').on(table.patientId)]
);

// 9. Suppliers, Pharmacy & Stock Movements
export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  contactPerson: text('contact_person'),
  phone: text('phone').notNull(),
  email: text('email'),
  address: text('address'),
  supplierType: text('supplier_type').default('Pharmaceutical & Medical').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const medicines = pgTable('medicines', {
  id: serial('id').primaryKey(),
  medicineName: text('medicine_name').notNull(),
  genericName: text('generic_name').notNull(),
  category: text('category').notNull(),
  dosageForm: text('dosage_form').default('Tablet').notNull(),
  strength: text('strength'),
  unitPriceMwk: integer('unit_price_mwk').notNull(),
  reorderLevel: integer('reorder_level').default(50).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pharmacyStock = pgTable(
  'pharmacy_stock',
  {
    id: serial('id').primaryKey(),
    medicineId: integer('medicine_id')
      .references(() => medicines.id, { onDelete: 'cascade' })
      .notNull(),
    batchNumber: text('batch_number').notNull(),
    quantity: integer('quantity').default(0).notNull(),
    expiryDate: text('expiry_date').notNull(),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    purchasePriceMwk: integer('purchase_price_mwk').default(0).notNull(),
    receivedAt: timestamp('received_at').defaultNow().notNull(),
  },
  (table) => [index('pharmacy_stock_med_idx').on(table.medicineId)]
);

export const prescriptions = pgTable(
  'prescriptions',
  {
    id: serial('id').primaryKey(),
    prescriptionNumber: text('prescription_number').notNull().unique(),
    consultationId: integer('consultation_id').references(() => consultations.id),
    patientId: integer('patient_id')
      .references(() => patients.id)
      .notNull(),
    doctorId: integer('doctor_id')
      .references(() => staffProfiles.id)
      .notNull(),
    status: text('status').default('Pending').notNull(),
    notes: text('notes'),
    dispensedByUserId: integer('dispensed_by_user_id').references(() => users.id),
    dispensedAt: timestamp('dispensed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('rx_patient_idx').on(table.patientId),
    index('rx_status_idx').on(table.status),
  ]
);

export const prescriptionItems = pgTable(
  'prescription_items',
  {
    id: serial('id').primaryKey(),
    prescriptionId: integer('prescription_id')
      .references(() => prescriptions.id, { onDelete: 'cascade' })
      .notNull(),
    medicineId: integer('medicine_id')
      .references(() => medicines.id)
      .notNull(),
    dosage: text('dosage').notNull(),
    frequency: text('frequency').notNull(),
    duration: text('duration').notNull(),
    quantityPrescribed: integer('quantity_prescribed').notNull(),
    quantityDispensed: integer('quantity_dispensed').default(0).notNull(),
    instructions: text('instructions'),
  },
  (table) => [index('rx_items_rx_idx').on(table.prescriptionId)]
);

// 10. Laboratory Tests, Requests & Results
export const laboratoryTests = pgTable('laboratory_tests', {
  id: serial('id').primaryKey(),
  testCode: text('test_code').notNull().unique(),
  testName: text('test_name').notNull(),
  category: text('category').notNull(),
  priceMwk: integer('price_mwk').notNull(),
  normalRange: text('normal_range'),
  turnaroundHours: integer('turnaround_hours').default(4).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

export const laboratoryRequests = pgTable(
  'laboratory_requests',
  {
    id: serial('id').primaryKey(),
    requestNumber: text('request_number').notNull().unique(),
    patientId: integer('patient_id')
      .references(() => patients.id)
      .notNull(),
    consultationId: integer('consultation_id').references(() => consultations.id),
    doctorId: integer('doctor_id').references(() => staffProfiles.id),
    testId: integer('test_id')
      .references(() => laboratoryTests.id)
      .notNull(),
    assignedTechnicianId: integer('assigned_technician_id').references(() => users.id),
    priority: text('priority').default('Routine').notNull(),
    status: text('status').default('Requested').notNull(),
    clinicalNotes: text('clinical_notes'),
    requestedAt: timestamp('requested_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('lab_req_patient_idx').on(table.patientId),
    index('lab_req_status_idx').on(table.status),
  ]
);

export const laboratoryResults = pgTable(
  'laboratory_results',
  {
    id: serial('id').primaryKey(),
    requestId: integer('request_id')
      .references(() => laboratoryRequests.id, { onDelete: 'cascade' })
      .notNull(),
    patientId: integer('patient_id')
      .references(() => patients.id)
      .notNull(),
    resultSummary: text('result_summary').notNull(),
    measuredValue: text('measured_value'),
    referenceRange: text('reference_range'),
    interpretation: text('interpretation').default('Normal').notNull(),
    technicianNotes: text('technician_notes'),
    reportFileName: text('report_file_name'),
    reportDataBase64: text('report_data_base64'),
    recordedByUserId: integer('recorded_by_user_id').references(() => users.id),
    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
  },
  (table) => [index('lab_res_req_idx').on(table.requestId)]
);

// 11. Billing, Services, Invoices & Payments (MWK)
export const hospitalServices = pgTable('hospital_services', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  departmentId: integer('department_id').references(() => departments.id),
  priceMwk: integer('price_mwk').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

export const invoices = pgTable(
  'invoices',
  {
    id: serial('id').primaryKey(),
    invoiceNumber: text('invoice_number').notNull().unique(),
    patientId: integer('patient_id')
      .references(() => patients.id)
      .notNull(),
    departmentId: integer('department_id').references(() => departments.id),
    totalAmountMwk: integer('total_amount_mwk').default(0).notNull(),
    paidAmountMwk: integer('paid_amount_mwk').default(0).notNull(),
    balanceMwk: integer('balance_mwk').default(0).notNull(),
    status: text('status').default('Unpaid').notNull(),
    dueDate: text('due_date'),
    notes: text('notes'),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('invoices_patient_idx').on(table.patientId),
    index('invoices_status_idx').on(table.status),
  ]
);

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: serial('id').primaryKey(),
    invoiceId: integer('invoice_id')
      .references(() => invoices.id, { onDelete: 'cascade' })
      .notNull(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    quantity: integer('quantity').default(1).notNull(),
    unitPriceMwk: integer('unit_price_mwk').notNull(),
    totalPriceMwk: integer('total_price_mwk').notNull(),
    referenceType: text('reference_type'),
    referenceId: integer('reference_id'),
  },
  (table) => [index('inv_items_inv_idx').on(table.invoiceId)]
);

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    receiptNumber: text('receipt_number').notNull().unique(),
    invoiceId: integer('invoice_id')
      .references(() => invoices.id, { onDelete: 'cascade' })
      .notNull(),
    patientId: integer('patient_id')
      .references(() => patients.id)
      .notNull(),
    amountMwk: integer('amount_mwk').notNull(),
    paymentMethod: text('payment_method').notNull(),
    referenceNumber: text('reference_number'),
    notes: text('notes'),
    receivedByUserId: integer('received_by_user_id').references(() => users.id),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
  },
  (table) => [
    index('payments_inv_idx').on(table.invoiceId),
    index('payments_patient_idx').on(table.patientId),
  ]
);

// 12. Inventory & Stock Movements
export const inventory = pgTable('inventory', {
  id: serial('id').primaryKey(),
  itemCode: text('item_code').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  quantity: integer('quantity').default(0).notNull(),
  unit: text('unit').default('Units').notNull(),
  reorderLevel: integer('reorder_level').default(20).notNull(),
  unitCostMwk: integer('unit_cost_mwk').default(0).notNull(),
  expiryDate: text('expiry_date'),
  supplierId: integer('supplier_id').references(() => suppliers.id),
  location: text('location').default('Central Medical Store'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: serial('id').primaryKey(),
    itemType: text('item_type').notNull(),
    medicineId: integer('medicine_id').references(() => medicines.id),
    inventoryItemId: integer('inventory_item_id').references(() => inventory.id),
    movementType: text('movement_type').notNull(),
    quantityDelta: integer('quantity_delta').notNull(),
    referenceNote: text('reference_note'),
    performedByUserId: integer('performed_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('stock_mov_type_idx').on(table.itemType)]
);

// 13. Hospital Settings & Audit Logs
export const hospitalSettings = pgTable('hospital_settings', {
  id: serial('id').primaryKey(),
  hospitalName: text('hospital_name').default('SmartCare Medical Centre').notNull(),
  tagline: text('tagline').default('Integrated Clinical & Hospital Operations').notNull(),
  logoUrl: text('logo_url'),
  phone: text('phone').default('+265 1 774 200').notNull(),
  email: text('email').default('info@smartcarehms.mw').notNull(),
  address: text('address').default('Area 13, Presidential Way, Lilongwe').notNull(),
  city: text('city').default('Lilongwe').notNull(),
  country: text('country').default('Malawi').notNull(),
  currencyCode: text('currency_code').default('MWK').notNull(),
  currencySymbol: text('currency_symbol').default('MWK').notNull(),
  taxNumber: text('tax_number').default('TPIN-MW-3098421'),
  backupSchedule: text('backup_schedule').default('Daily at 02:00 CAT'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    userName: text('user_name').notNull(),
    userRole: text('user_role').notNull(),
    action: text('action').notNull(),
    module: text('module').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    details: text('details'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_module_idx').on(table.module),
    index('audit_created_idx').on(table.createdAt),
  ]
);

// Relations
export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  rolePermissions: many(rolePermissions),
}));

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
  }),
}));

export const patientsRelations = relations(patients, ({ many }) => ({
  appointments: many(appointments),
  consultations: many(consultations),
  admissions: many(admissions),
  invoices: many(invoices),
  documents: many(patientDocuments),
}));
