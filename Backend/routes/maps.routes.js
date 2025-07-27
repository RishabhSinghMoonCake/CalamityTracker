import express from 'express';
import addressCoordinates,{getAutocompleteSuggestions} from '../controllers/maps.controller.js';

const router = express.Router();

router.get('/get-coordinates' , addressCoordinates);

router.get('/get-autocomplete-suggestions', getAutocompleteSuggestions);
export default router;