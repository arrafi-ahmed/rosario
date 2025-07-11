const router = require("express").Router();
const checkinService = require("../service/checkin");
const eventService = require("../service/event");
const ApiResponse = require("../model/ApiResponse");
const {auth, isAdminEventAuthor} = require("../middleware/auth");

router.post("/save", auth, isAdminEventAuthor, (req, res, next) => {
    checkinService
        .save({
            newCheckin: {
                ...req.body.payload?.newCheckin,
                checkedinBy: req.currentUser.id,
            },
        })
        .then((results) =>
            res.status(200).json(new ApiResponse("Check-in saved!", results)),
        )
        .catch((err) => next(err));
});

router.post(
    "/scanByRegistrationId",
    auth,
    isAdminEventAuthor,
    async (req, res, next) => {
        try {
            const checkinResult = await checkinService.scanByRegistrationId({
                ...req.body.payload,
                userId: req.currentUser.id,
            });
            const event = await eventService.getEvent({eventId: req.body.payload.eventId});

            const badgeHtml = await checkinService.getBadgeHtml({
                registration: {
                    id: checkinResult.rId,
                    qrUuid: checkinResult.qrUuid,
                    name: checkinResult.registrationData.name,
                    email: checkinResult.registrationData.email,
                    rut: checkinResult.registrationData.others?.rut,
                },
                event: {
                    name: event.name,
                    banner: event.banner,
                },
            });

            return res.status(200).json(
                new ApiResponse("Check-in successful!", {
                    checkinResult,
                    badgeHtml,
                })
            );
        } catch (err) {
            next(err);
        }
    }
);


router.get("/getStatistics", auth, isAdminEventAuthor, (req, res, next) => {
    checkinService
        .getStatistics({eventId: req.query.eventId, date: req.query.date})
        .then((results) => res.status(200).json(new ApiResponse(null, results)))
        .catch((err) => next(err));
});

module.exports = router;
