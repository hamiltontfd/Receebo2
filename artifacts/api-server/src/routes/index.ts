import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import receiptsRouter from "./receipts";
import guestSessionRouter from "./guestSession";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(receiptsRouter);
router.use(guestSessionRouter);

export default router;
