const router = require("express").Router();
const appUserService = require("../service/appUser");
const ApiResponse = require("../model/ApiResponse");
const {auth, isSudo} = require("../middleware/auth");
const {ifSudo} = require("../others/util");

// handled by admin
router.post("/save", auth, isSudo, (req, res, next) => {
    appUserService
        .save({payload: {...req.body}})
        .then((results) =>
            res.status(200).json(new ApiResponse("User saved!", results)),
        )
        .catch((err) => next(err));
});

router.get("/getAppUsers", auth, (req, res, next) => {
    if (!ifSudo(req.currentUser.role))
        return res.status(403).json(new ApiResponse("Invalid Request!", null));

    appUserService
        .getAppUsers({clubId: req.query.clubId})
        .then((results) => res.status(200).json(new ApiResponse(null, results)))
        .catch((err) => next(err));
});

router.get("/deleteAppUser", auth, (req, res, next) => {
    if (!ifSudo(req.currentUser.role))
        return res.status(403).json(new ApiResponse("Invalid Request!", null));

    appUserService
        .deleteAppUser({id: req.query.id})
        .then((results) => res.status(200).json(new ApiResponse("User removed!", results)))
        .catch((err) => next(err));
});

module.exports = router;
