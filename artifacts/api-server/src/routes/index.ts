import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import receiptsRouter from "./receipts";
import attachmentsRouter from "./attachments";
import guestSessionRouter from "./guestSession";
import billingRouter from "./billing";
import adminRouter from "./admin";
import notificationsRouter from "./notifications";
import gmailRouter from "./gmail";
import outlookRouter from "./outlook";
import mailRouter from "./mail";
import pushRouter from "./push";
import accountRouter from "./account";
import { requireAuthOrGuest } from "../middlewares/guestAuth";
import { requireProductAccess } from "../middlewares/productAccess";

const router: IRouter = Router();

router.use(healthRouter);
router.use(
  ["/receipts", "/gmail/sync", "/gmail/pending", "/outlook/sync", "/mail/sync", "/mail/pending", "/storage/objects"],
  requireAuthOrGuest,
  requireProductAccess,
);
router.use(storageRouter);
router.use(receiptsRouter);
router.use(attachmentsRouter);
router.use(guestSessionRouter);
router.use(billingRouter);
router.use(adminRouter);
router.use(notificationsRouter);
router.use(gmailRouter);
router.use(outlookRouter);
router.use(mailRouter);
router.use(pushRouter);
router.use(accountRouter);

export default router;
