const CustomError = require("../model/CustomError");
const {sql} = require("../db");
const {v4: uuidv4} = require("uuid");
const {generatePassword, isBcryptHash} = require("../others/util");
const {hash, compare} = require("bcrypt");

// role 10 = sudo, 20 = admin
exports.save = async ({payload}) => {
    // if add request
    if (!payload.id) {
        delete payload.id;
        payload.password = generatePassword()
    }
    if (!isBcryptHash(payload.password)) {
        payload.password = await hash(payload.password, 10);
    }
    payload.role = Number(payload.role) || 20;

    let upsertedUser = null;
    try {
        [upsertedUser] = await sql`
            insert into app_user ${sql(payload)} on conflict (id)
            do
            update set ${sql(payload)}
                returning *`;
    } catch (err) {
        if (err.code === "23505")
            throw new CustomError("Email already taken!", 409);
        else throw err;
    }
    return upsertedUser;
};

exports.getAppUsers = async ({clubId, roles = [20]}) => {
    const result = await sql`
        select *
        from app_user
        where role in ${sql(roles)}
          and club_id = ${clubId}`;

    const appUsers = result.filter((item) => roles.includes(item.role));
    return {appUsers};
};

exports.deleteAppUser = async ({id}) => {
    const result = await sql`
        delete
        from app_user
        where id = ${id} returning *;`

    return result;
};
