const router = require("express").Router();
const authService = require("../service/auth");
const ApiResponse = require("../model/ApiResponse");

router.post("/register", async (req, res, next) => {
    try {
        const savedUser = await authService
            .register({payload: req.body})

        res
            .status(200)
            .json(new ApiResponse("Registration successful!", {result: savedUser}));
    } catch (err) {
        next(err)
    }
});

router.post("/signin", (req, res, next) => {
    authService
        .signin(req.body)
        .then(({token, currentUser}) => {
            if (token) {
                res
                    .status(200)
                    .header("authorization", token)
                    .json(new ApiResponse("Sign in successful!", {currentUser}));
            }
        })
        .catch((err) => next(err));
});

router.post("/requestResetPass", (req, res, next) => {
    authService
        .requestResetPass({payload: req.body})
        .then((result) => {
            res
                .status(200)
                .json(
                    new ApiResponse("Password reset link sent to your email!", result),
                );
        })
        .catch((err) => next(err));
});

router.post("/submitResetPass", (req, res, next) => {
    authService
        .submitResetPass({payload: req.body})
        .then((result) => {
            res
                .status(200)
                .json(new ApiResponse("Password reset successful!", result));
        })
        .catch((err) => next(err));
});

module.exports = router;
