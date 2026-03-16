import { Router, type IRouter } from "express";
import healthRouter from "./health";
import timeslotsRouter from "./timeslots";

const router: IRouter = Router();

router.use(healthRouter);
router.use(timeslotsRouter);

export default router;
