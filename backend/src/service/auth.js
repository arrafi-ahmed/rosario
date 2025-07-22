const jwt = require("jsonwebtoken");
const {v4: uuidv4} = require("uuid");
const {hash, compare, compareSync} = require("bcrypt");
const CustomError = require("../model/CustomError");
const {sql} = require("../db");
const {ifAdmin, generatePassword, isBcryptHash} = require("../others/util");
const clubService = require("./club");

const generateAuthData = async (result) => {
    let token = "";
    let currentUser = {};

    if (result) {
        currentUser = {
            id: result.id,
            role: Number(result.role),
            fullName: result.fullName,
        };

        if (ifAdmin(currentUser.role)) {
            const [club] = await sql`
                select *
                from club
                where id = ${result.clubId}`;

            currentUser.clubId = club.id || null;
            currentUser.clubName = club.name || null;
        }
        token = jwt.sign({currentUser}, process.env.TOKEN_SECRET);
    }

    return {token, currentUser};
};

exports.signin = async ({email, password}) => {
    const user = await exports.getUserByEmail({email});
    if (!user?.email) {
        throw new CustomError("User not found!", 401);
    }
    const isPasswordValid = await compare(password, user.password); // Compare hashed password

    if (!isPasswordValid) {
        throw new CustomError("Incorrect email/password!", 401);
    }
    return generateAuthData(user);
};

exports.register = async ({payload}) => {
    //create club
    const newClub = {
        name: payload.fullName,
    }
    const savedClub = await clubService.save({payload: newClub});

    const newUser = {
        ...payload,
        clubId: savedClub.id,
        password: await hash(payload.password, 10),
        role: 20,
    }

    let upsertedUser = null;
    try {
        [upsertedUser] = await sql`
            insert into app_user ${sql(newUser)} returning *`;
    } catch (err) {
        if (err.code === "23505") {
            await clubService.removeClub({clubId: savedClub.id});
            throw new CustomError("Email already taken!", 409);
        } else throw err;
    }
    return upsertedUser;
};

exports.getUserByEmail = async ({email}) => {
    const [user] = await sql`
        select *
        from app_user
        where email = ${email}`;
    return user;
};

exports.getUserById = async ({id}) => {
    const [user] = await sql`
        select *
        from app_user
        where id = ${id}`;
    return user;
};

exports.requestResetPass = async ({payload: {resetEmail}}) => {
    const fetchedUser = await exports.getUserByEmail({email: resetEmail});
    if (!fetchedUser) throw new CustomError("User doesn't exist!");

    const reset = {
        userId: fetchedUser.id,
        email: resetEmail,
        token: uuidv4(),
        createdAt: new Date(),
    };
    const [savedReq] = await sql`
        insert into password_reset ${sql(reset)} on conflict(id) do
        update set ${sql(reset)}
            returning *`;

    sendPasswordResetEmail({
        to: fetchedUser.email,
        user: fetchedUser,
        token: savedReq.token,
    }).catch((err) => {
        // Optional: log but don’t crash
        console.error("Failed to send password reset email:", err);
    });
};

exports.submitResetPass = async ({payload: {token, newPass}}) => {
    const [reset] = await sql`
        select *
        from password_reset
        where token = ${token}`;
    if (!reset) throw new CustomError("Invalid request!");

    const expirationMillis = reset.createdAt.getTime() + 3600000; // 1 hour in milliseconds
    if (expirationMillis < Date.now())
        throw new CustomError("Password reset link expired!");

    const fetchedUser = await exports.getUserById({id: reset.userId});

    const savedUser = await exports.save({
        payload: {...fetchedUser, password: newPass},
    });
    return savedUser;
};