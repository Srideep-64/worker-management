import { Router } from "express";
import { validate } from "../middleware/validate.js";
import {
  listClients,
  listClientsQuerySchema,
  getClient,
  createClient,
  createClientSchema,
  updateClient,
  updateClientSchema,
} from "../controllers/clients.controller.js";

const router = Router();

router.get("/clients", validate({ query: listClientsQuerySchema }), listClients);
router.get("/clients/:id", getClient);
router.post("/clients", validate({ body: createClientSchema }), createClient);
router.put("/clients/:id", validate({ body: updateClientSchema }), updateClient);

export default router;
