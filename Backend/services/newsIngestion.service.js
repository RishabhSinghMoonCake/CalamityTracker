import RawArticle from "../models/rawArticle.model.js";
import {fetchNews} from "./disaster.service.js";

export async function ingestNews(){
  const articles = await fetchNews();

  if(articles.length == 0){
    return {
      fetched:0,
      inserted:0,
      alreadyKnown:0
    };
  }

  const operations = articles.map((article) => ({
    updateOne:{
      filter:{
        canonicalUrl: article.canonicalUrl
      },
      update:{
        $setOnInsert:article //only apply this data if new document 
      },
      upsert: true //update and insert
    }
  }));

  try{
    const result = await RawArticle.bulkWrite(operations,{
      ordered: false
    });

    const summary = {
      fetched: articles.length,
      inserted: result.upsertedCount??0,
      alreadyKnown: result.matchedCount??0
    };
    console.log("News ingestion complete:", summary);
    return summary;
  } catch(error){
    console.error("News ingestion failed:",error.message);
    throw error;
  }


}