import { Router, type IRouter } from "express";
import healthRouter from "./health";
import timeslotsRouter from "./timeslots";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(timeslotsRouter);
router.use(aiRouter);

export default router;
