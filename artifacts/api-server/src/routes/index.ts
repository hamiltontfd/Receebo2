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
import pushRouter from "./push";
import accountRouter from "./account";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(receiptsRouter);
router.use(attachmentsRouter);
router.use(guestSessionRouter);
router.use(billingRouter);
router.use(adminRouter);
router.use(notificationsRouter);
router.use(gmailRouter);
router.use(pushRouter);
router.use(accountRouter);

export default router;
