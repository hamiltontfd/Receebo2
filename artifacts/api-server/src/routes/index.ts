import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import receiptsRouter from "./receipts";
import attachmentsRouter from "./attachments";
import guestSessionRouter from "./guestSession";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(receiptsRouter);
router.use(attachmentsRouter);
router.use(guestSessionRouter);
router.use(billingRouter);

export default router;
