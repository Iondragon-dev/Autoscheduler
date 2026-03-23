import { Router, type IRouter } from "express";
import healthRouter from "./health";
import timeslotsRouter from "./timeslots";
import aiRouter from "./ai";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(timeslotsRouter);
router.use(aiRouter);
router.use(authRouter);

export default router;
