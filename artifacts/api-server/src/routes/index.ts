import { Router, type IRouter } from "express";
import healthRouter from "./health";
import timeslotsRouter from "./timeslots";
import aiRouter from "./ai";
import authRouter from "./auth";
import teachersRouter from "./teachers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(timeslotsRouter);
router.use(aiRouter);
router.use(authRouter);
router.use(teachersRouter);

export default router;
