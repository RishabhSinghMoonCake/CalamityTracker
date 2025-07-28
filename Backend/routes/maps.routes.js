import express from 'express';
import addressCoordinates,{distanceBetween, getAutocompleteSuggestions} from '../controllers/maps.controller.js';

const router = express.Router();

router.get('/get-coordinates' , addressCoordinates);

router.get('/get-autocomplete-suggestions', getAutocompleteSuggestions);
export default router;

router.get('/get-distance' , distanceBetween)