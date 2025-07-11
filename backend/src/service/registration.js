const CustomError = require("../model/CustomError");
const {sql} = require("../db");
const {v4: uuidv4} = require("uuid");
const exceljs = require("exceljs");
const {formatTime} = require("../others/util");
const formService = require("../service/form");
const eventService = require("../service/event");
const emailService = require("../service/email");

exports.bulkImportAttendee = async ({excelFile, eventId, clubId}) => {
    const sheetPath = excelFile.path;
    const workbook = new exceljs.Workbook();
    await workbook.xlsx.readFile(sheetPath);
    const worksheet = workbook.worksheets[0];

    const headers = worksheet.getRow(1).values.slice(1); // ignore first undefined
    const rows = [];

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = row.values.slice(1); // 1-based index
        const rowObj = Object.fromEntries(
            headers.map((h, i) => [h, values[i] || ""]),
        );

        rows.push(rowObj);
    });

    const attendees = [];
    for (const row of rows) {
        // format cell with object data type to simple string
        for (const key in row) {
            const value = row[key];
            if (typeof value === 'object' && value !== null && 'text' in value) {
                row[key] = value.text.trim();
            }
        }

        const {
            name,
            first_name,
            last_name,
            email,
            phone,
            ...others
        } = row;

        // dynamic based on excel header availability
        const fullName = name?.trim() || `${first_name || ""} ${last_name || ""}`.trim();

        const registrationData = {
            name: fullName,
            email,
            phone,
            others
        };

        attendees.push({
            registrationData,
            registrationTime: Date.now(),
            status: true,
            qrUuid: uuidv4(),
            eventId,
            clubId,
        });
    }
    let savedRegistrations = [];
    if (attendees.length) {
        savedRegistrations = await sql`
            insert into registration ${sql(attendees)} returning *`;
    }

    //send ticket
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(5); // Max 5 concurrent emails
    const tasks = savedRegistrations.map((registration) => {
            limit(() => emailService.sendTicket({registrationId: registration.id}))
        }
    );
    await Promise.all(tasks);

    return {insertCount: savedRegistrations.length};
};

exports.defaultSave = async ({payload}) => {
    // if event is paid, set 'status = unpaid' by default, after stripe purchase set 'status = paid' thru webhook
    const event = await eventService.getEvent({eventId: payload.eventId});
    payload.status = event.ticketPrice <= 0;
    return exports.save({payload});
};

exports.save = async ({payload}) => {
    payload.registrationTime = new Date();
    payload.qrUuid = uuidv4();

    const [insertedRegistration] = await sql`
        INSERT INTO registration ${sql(payload)} returning *;
    `;

    return insertedRegistration;
};

exports.updateStatus = async ({payload: {id, uuid, status}}) => {
    const [registration] = await sql`
        update registration
        set status = ${status}
        where id = ${id}
          and qr_uuid = ${uuid} returning *`;
    ``;
    return registration;
};

exports.getRegistration = async ({registrationId, qrUuid, isLoggedIn}) => {
    const [registration] = await sql`
        select *
        from registration r
        where r.id = ${registrationId} ${
                !isLoggedIn
                        ? sql` and qr_uuid =
                        ${qrUuid}`
                        : sql``
        }`;
    return registration;
};

exports.getRegistrationWEventWExtrasPurchase = async ({registrationId}) => {
    const [registration] = await sql`
        SELECT
            jsonb_build_object(
                    'id', r.id,
                    'qrUuid', r.qr_uuid,
                    'registrationData', r.registration_data,
                    'registrationTime', r.registration_time,
                    'status', r.status
            ) AS registration,
            jsonb_build_object(
                    'id', e.id,
                    'name', e.name,
                    'startDate', e.start_date,
                    'endDate', e.end_date,
                    'location', e.location
            ) AS event,
            COALESCE(jsonb_build_object(
                             'id', ep.id,
                             'qrUuid', ep.qr_uuid,
                             'extrasData', ep.extras_data,
                             'status', ep.status,
                             'scannedAt', ep.scanned_at
                     ), NULL) AS extrasPurchase

        FROM registration r
                 JOIN event e ON r.event_id = e.id
                 LEFT JOIN extras_purchase ep ON ep.registration_id = r.id
        WHERE r.id = ${registrationId}
            LIMIT 1;
    `;
    return registration;
};

exports.getAttendees = async ({
                                  eventId,
                                  searchKeyword = "",
                                  sortBy = "registration",
                              }) => {
    const keyword = `%${searchKeyword}%`;

    //@formatter:off
    const attendees = await sql`
      SELECT jsonb_build_object(
                     'id', r.id,
                     'registrationData', r.registration_data,
                     'registrationTime', r.registration_time,
                     'status', r.status,
                     'qrUuid', r.qr_uuid,
                     'eventId', r.event_id,
                     'clubId', r.club_id
             )                          AS registration,
             COALESCE(jsonb_build_object(
                              'id', c.id,
                              'status', c.status,
                              'checkinTime', c.checkin_time
                      ), '{}' ::jsonb)  AS checkin,
             CASE
                 WHEN ep.id IS NOT NULL THEN jsonb_build_object(
                         'id', ep.id,
                         'extrasData', ep.extras_data,
                         'status', ep.status,
                         'qrUuid', ep.qr_uuid,
                         'scannedAt', ep.scanned_at
                                             )
                 ELSE NULL
                 END                    AS extras
      FROM registration r
               LEFT JOIN checkin c ON r.id = c.registration_id
               LEFT JOIN extras_purchase ep ON r.id = ep.registration_id
      WHERE r.event_id = ${eventId}
        AND r.status = true
        AND (
              ${
                  searchKeyword
                          ? sql`
                              r.registration_data ->> 'name' ILIKE ${keyword} OR
                              r.registration_data ->> 'email' ILIKE ${keyword} OR
                              r.registration_data ->> 'phone' ILIKE ${keyword}
                          `
                          : sql`true`
              }
          )
          ${
              sortBy === "registration"
                      ? sql`ORDER BY r.registration_time DESC`
                      : sortBy === "checkin"
                              ? sql`ORDER BY c.checkin_time ASC`
                              : sql``
          };
    `;
    //@formatter:on

    return attendees;
};

exports.removeRegistration = async ({eventId, registrationId}) => {
    const [deletedEvent] = await sql`
        delete
        from registration
        where id = ${registrationId}
          and event_id = ${eventId} returning *;`;

    return deletedEvent;
};
exports.validateExtrasQrCode = async ({id, qrUuid, eventId}) => {
    const [extrasPurchase] = await sql`
        select *, r.id as r_id, ep.id as id
        from registration r
                 left join extras_purchase ep on r.id = ep.registration_id
        where ep.id = ${id}
          and r.event_id = ${eventId}
          and r.status = true`;

    if (!extrasPurchase || extrasPurchase.qrUuid != qrUuid) {
        throw new CustomError("Invalid QR Code", 401, extrasPurchase);
    } else if (extrasPurchase.status === true) {
        throw new CustomError("Already Redeemed", 401, extrasPurchase);
    }
    return extrasPurchase;
};

exports.scanByExtrasPurchaseId = async ({qrCodeData, eventId}) => {
    const {id, qrUuid} = JSON.parse(qrCodeData);
    const extrasPurchase = await exports.validateExtrasQrCode({
        id,
        qrUuid,
        eventId,
    });
    const payload = {id: extrasPurchase.id, status: true};
    const updatedExtrasPurchase = await eventService.updateExtrasPurchaseStatus({
        payload,
    });
    return updatedExtrasPurchase;
};

exports.downloadAttendees = async ({eventId}) => {
    const attendees = await exports.getAttendees({eventId});
    const formQuestions = await formService.getFormQuestions(eventId);

    const isExtraExists = attendees.some((attendee) => attendee.extras?.id);

    if (attendees.length === 0)
        throw new CustomError("No data available for report!", 404);

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet("Attendee Report");

    const sheet_columns = [
        {header: "Registration ID", key: "registration_id", width: 15},
        {header: "Name", key: "name", width: 25},
        {header: "Email", key: "email", width: 25},
        {header: "Phone", key: "phone", width: 20},
        {header: "Registration Time", key: "registration_time", width: 25},
        {header: "Checkin Time", key: "checkin_time", width: 25},
        {header: "Checkin Status", key: "checkin_status", width: 20},

    ];
    if (isExtraExists) {
        sheet_columns.push({header: "Voucher Status", key: "extras_status", width: 20},);
    }

    if (formQuestions.length > 0) {
        formQuestions.forEach((q) => {
            sheet_columns.push({
                header: q.text,
                key: `qId_${q.id}`,
                width: 30,
            });
        });
    }

    worksheet.columns = sheet_columns;

    attendees.forEach((item) => {
        const reg = item.registration || {};
        const checkin = item.checkin || {};

        const rowData = {
            registration_id: reg.id,
            name: reg.registrationData?.name || "",
            email: reg.registrationData?.email || "",
            phone: reg.registrationData?.phone || "",
            registration_time: reg.registrationTime
                ? formatTime(reg.registrationTime)
                : "",
            checkin_time: checkin.checkinTime ? formatTime(checkin.checkinTime) : "",
            checkin_status: checkin.status ? "Checked-in" : "Pending",
        };
        if (item.extras?.id) {
            rowData.extras_status = item.extras?.status ? "Redeemed" : "Not Redeemed";
        }

        // Handle dynamic form questions inside registrationData.others array
        const others = reg.registrationData?.others || [];
        others.length && others.forEach((answer) => {
            if (answer.qId) {
                rowData[`qId_${answer.qId}`] = answer.answer?.toString() || "";
            }
        });

        worksheet.addRow(rowData);
    });

    return workbook;
};
