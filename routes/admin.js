const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

//requiring product model
let Product = require('../models/product');

// Checks if user is authenticated
function isAuthenticatedUser(req, res, next) {
    if(req.isAuthenticated()) {
        return next();
    }
    req.flash('error_msg', 'Please Login first to access this page.')
    res.redirect('/login');
}


// let browser = await puppeteer;

//Scrape Function
async function scrapeData(url, page) {
    try {
        await page.goto(url, {waitUntil: 'load', timeout : 0});
        const html = await page.evaluate(()=> document.body.innerHTML);
        const $ = await cheerio.load(html);

        let title = $("h1").attr('content');
        let price = $(".price-characteristic").attr("content");

        if(!price) {
            let dollars = $("#price > div > span.hide-content.display-inline-block-m > span > span.price-group.price-out-of-stock > span.price-characteristic").text();
            let cents = $("#price > div > span.hide-content.display-inline-block-m > span > span.price-group.price-out-of-stock > span.price-mantissa").text();
            price = dollars+'.'+cents;
        }

        let seller = '';
        let checkSeller = $('.seller-name');
        if(checkSeller) {
            seller = checkSeller.text();
        }

        let outOfStock = '';
        let checkOutOfStock = $('.prod-ProductOffer-oosMsg');
        if(checkOutOfStock) {
            outOfStock = checkOutOfStock.text();
        }

        let deliveryNotAvaiable = '';
        let checkDeliveryNotAvailable = $('.fulfillment-shipping-text');
        if(checkDeliveryNotAvailable) {
            deliveryNotAvaiable = checkDeliveryNotAvailable.text();
        }

        let stock = '';

        if(!(seller.includes('Walmart')) || outOfStock.includes('Out of Stock') || 
            deliveryNotAvaiable.includes('Delivery not available')) {
                stock = 'Out of stock';
            } else {
                stock = 'In stock';
            }

        return {
            title,
            price,
            stock,
            url
        }

    } catch (error) {
        console.log(error);
    }
}

//GET routes starts here

router.get('/', (req,res)=> {
    res.render('./admin/index');
});

router.get('/dashboard', isAuthenticatedUser,(req,res)=> {

    Product.find({})
        .then(products => {
            res.render('./admin/dashboard', {products : products});
    });
    
});


router.get('/product/new', isAuthenticatedUser, async (req, res)=> {
    try {
        let url = req.query.search;
        if(url) {
            let browser = await puppeteer.launch({ args: ['--no-sandbox'] });
            const page = await browser.newPage();
            let result = await scrapeData(url,page);

            let productData = {
                title : result.title,
                price : '$'+result.price,
                stock : result.stock,
                productUrl : result.url
            };
            res.render('./admin/newproduct', {productData : productData});
            browser.close();
        } else {
            let productData = {
                title : "",
                price : "",
                stock : "",
                productUrl : ""
            };
            res.render('./admin/newproduct', {productData : productData});
        }
    } catch (error) {
        req.flash('error_msg', 'ERROR: '+error);
        res.redirect('/product/new');
    }
});

router.get('/product/search', isAuthenticatedUser, (req,res)=> {
    let userSku = req.query.sku;
    if(userSku) {
        Product.findOne({sku : userSku})
            .then(product => {
                if(!product) {
                    req.flash('error_msg', 'Product does not exist in the database.');
                    return res.redirect('/product/search');
                }

                res.render('./admin/search', {productData : product});
            })
            .catch(err => {
                req.flash('error_msg', 'ERROR: '+err);
                res.redirect('/product/new');
            });
    } else {
        res.render('./admin/search', {productData : ''});
    }
});

router.get('/products/instock', isAuthenticatedUser, (req,res)=> {
    Product.find({newstock : "In stock"})
        .then(products => {
            res.render('./admin/instock', {products : products});
        })
        .catch(err => {
            req.flash('error_msg', 'ERROR: '+err);
            res.redirect('/dashboard');
        });
});

router.get('/products/outofstock', isAuthenticatedUser, (req,res)=> {
    Product.find({newstock : "Out of stock"})
        .then(products => {
            res.render('./admin/outofstock', {products : products});
        })
        .catch(err => {
            req.flash('error_msg', 'ERROR: '+err);
            res.redirect('/dashboard');
        });
});

router.get('/products/pricechanged', isAuthenticatedUser, (req,res)=> {
    Product.find({})
        .then(products => {
            res.render('./admin/pricechanged', {products : products});
        })
        .catch(err => {
            req.flash('error_msg', 'ERROR: '+err);
            res.redirect('/dashboard');
        });
});

router.get('/products/backinstock', isAuthenticatedUser, (req,res)=> {
    Product.find({$and: [{oldstock : 'Out of stock'},{newstock : 'In stock'}]})
        .then(products => {
            res.render('./admin/backinstock', {products : products});
        })
        .catch(err => {
            req.flash('error_msg', 'ERROR: '+err);
            res.redirect('/dashboard');
        });
});

router.get('/products/updated', isAuthenticatedUser, (req,res)=> {
    Product.find({updatestatus : "Updated"})
        .then(products => {
            res.render('./admin/updatedproducts', {products : products});
        })
        .catch(err => {
            req.flash('error_msg', 'ERROR: '+err);
            res.redirect('/dashboard');
        });
});


router.get('/products/notupdated', isAuthenticatedUser, (req,res)=> {
    Product.find({updatestatus : "Not Updated"})
        .then(products => {
            res.render('./admin/notupdatedproducts', {products : products});
        })
        .catch(err => {
            req.flash('error_msg', 'ERROR: '+err);
            res.redirect('/dashboard');
        });
});

router.get('/update', isAuthenticatedUser, (req,res)=> {
    res.render('./admin/update', {message : ''});
});
//POST routes starts here

router.post('/product/new', isAuthenticatedUser, (req,res)=> {
    let {title, price, stock, url, sku} = req.body;

    let newProduct = {
        title : title,
        newprice : price,
        oldprice : price,
        newstock : stock,
        oldstock : stock,
        sku : sku,
        company : "Walmart",
        url : url,
        updatestatus : "Updated"
    };

    Product.findOne({ sku : sku})
        .then(product => {
            if(product) {
                req.flash('error_msg', 'Product already exist in the database.');
                return res.redirect('/product/new');
            }

            Product.create(newProduct)
                .then(product => {
                    req.flash('success_msg', 'Product added successfully in the database.');
                    res.redirect('/product/new');
                })
        })
        .catch(err => {
            req.flash('error_msg', 'ERROR: '+err);
            res.redirect('/product/new');
        });
});

router.post('/update', isAuthenticatedUser, async(req, res)=>{
    try {
        res.render('./admin/update', {message: 'update started.'});

        Product.find({})
            .then(async products => {
                for(let i=0; i<products.length; i++) {
                    Product.updateOne({'url' : products[i].url}, {$set: {'oldprice' : products[i].newprice, 'oldstock' : products[i].newstock, 'updatestatus' : 'Not Updated'}})
                        .then(products => {})
                }

                let browser = await puppeteer.launch({ args: ['--no-sandbox'] });
                const page = await browser.newPage();

                for(let i=0; i<products.length; i++) {
                    let result = await scrapeData(products[i].url,page);
                    Product.updateOne({'url' : products[i].url}, {$set: {'title' : result.title, 'newprice' : '$'+result.price, 'newstock' : result.stock, 'updatestatus' : 'Updated'}})
                        .then(products => {})
                }

                browser.close();

            })
            .catch(err => {
                req.flash('error_msg', 'ERROR: '+err);
                res.redirect('/dashboard');
            });
        
    } catch (error) {
        req.flash('error_msg', 'ERROR: '+err);
        res.redirect('/dashboard');
    }
});

//DELETE routes starts here
router.delete('/delete/product/:id', isAuthenticatedUser, (req, res)=> {
    let searchQuery = {_id : req.params.id};

    Product.deleteOne(searchQuery)
        .then(product => {
            req.flash('success_msg', 'Product deleted successfully.');
            res.redirect('/dashboard');
        })
        .catch(err => {
            req.flash('error_msg', 'ERROR: '+err);
            res.redirect('/dashboard');
        });
});

router.get('*', (req, res)=> {
    res.render('./admin/notfound');
});

module.exports = router;