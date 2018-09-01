/*
*
*
*       Complete the API routing below
*
*
*/

'use strict';

const expect = require('chai').expect;
const MongoClient = require('mongodb').MongoClient;
const fetch = require('node-fetch');
const DATABASE = process.env.DATABASE; 

module.exports = function (app, db) {
  MongoClient.connect(DATABASE, function(err, db) {
    if (err) {
      console.log(err);
    } else {
      console.log('Connected');

      app.route('/api/stock-prices')
        .get(function (req, res){
          const query = {
            stock: req.query.stock,
            like: req.query.like ? 1 : 0,
            ip: req.headers['x-forwarded-for'].split(',')[0]
          };
        
          if (!query.stock) {
            res.redirect('/');
          }
        
          if (typeof query.stock == 'string') {
            fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${query.stock}&apikey=${process.env.AV_KEY}`)
              .then(data => data.json())
              .catch(err => console.log(err))
              .then(data => {
                const stock = {
                  symbol: data['Global Quote']['01. symbol'],
                  price: data['Global Quote']['05. price']
                }
                
                db.collection('stocks').findOne({symbol: stock.symbol}, (err, doc) => {
                  if (err) console.log(err);
                  else {
                    const allowLike = !(doc && doc.ip && doc.ip.includes(query.ip));

                    db.collection('stocks').findAndModify(
                      {symbol: stock.symbol},
                      {},
                      {$setOnInsert:{
                        symbol: stock.symbol,
                        price: stock.price
                      },$set:{
                        last_update: new Date()
                      },$addToSet:{
                        ip: query.like && query.ip
                      },$inc:{
                        likes: (query.like && allowLike) ? 1 : 0
                      }},
                      {upsert:true, new: true},
                      (err, doc) => {
                        if (err) console.log(err)
                        else {
                          res.json({stockData: {stock: doc.value.symbol, price: doc.value.price, likes: doc.value.likes}});
                        }                      
                      }
                    );
                  }
                });
                            
              }).catch(err => {console.log(err)});
            
          } else {
            const stocksPromise = [];
            query.stock.map(stock => stocksPromise.push(fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${stock}&apikey=${process.env.AV_KEY}`)));
            
            Promise.all(stocksPromise)
              .then((res, i) => {
                const jsonPromise = [];
                res.map(res => jsonPromise.push(res.json()));
                return Promise.all(jsonPromise);
              })
              .catch(err => {console.log(err)})
              .then((data) => {
                const stocks = data.map(data => ({
                  symbol: data['Global Quote']['01. symbol'],
                  price: data['Global Quote']['05. price'],
                  like: query.like ? 1 : 0,
                  likes: 0
                }))
              
              
                stocks.map((stock, i) => {
                  db.collection('stocks').findOne({symbol: stock.symbol}, (err, doc) => {
                    if (err) console.log(err)
                    else {
                      const allowLike = !(doc && doc.ip && doc.ip.includes(query.ip));

                      db.collection('stocks').findAndModify(
                        {symbol: stock.symbol},
                        {},
                        {$setOnInsert:{
                          symbol: stock.symbol,
                          price: stock.price
                        },$set:{
                          last_update: new Date()
                        },$addToSet:{
                          ip: query.like && query.ip
                        },$inc:{
                          likes: (stock.like && allowLike) ? 1 : 0
                        }},
                        {upsert:true, new: true},
                        (err, doc) => {
                          if (err) console.log(err)
                          else {
                            stocks[i].likes = doc.value.likes;

                            if (i == stocks.length - 1) {
                              const response = {};
                              response.stockData = stocks.map((stock, i) => ({
                                stock: stock.symbol, price: stock.price, rel_likes: stock.likes - stocks[(i + 1) % 2].likes
                              }));
                              res.json(response);
                            }
                          }                      
                        }
                      );
                    }
                  });
                  
                });
              
              }).catch(err => {console.log(err)});
            }
        });
    }  
  });
};
