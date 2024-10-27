'use strict';

/**
 * PRELOAD
 * 
 * loading will end after the document is loaded
 */
const preloader = document.querySelector("[data-preaload]");

window.addEventListener("load", function() {
    preloader.classList.add("loaded");
    document.body.classList.add("loaded");
});

/**
 * Add event listener on multiple elements
 */
const addEventOnElements = function(elements, eventType, callback) {
    for (let i = 0, len = elements.length; i < len; i++) {
        elements[i].addEventListener(eventType, callback);
    }
}

/**
 * NAVBAR
 */
const navbar = document.querySelector("[data-navbar]");
const navTogglers = document.querySelectorAll("[data-nav-toggler]");
const overlay = document.querySelector("[data-overlay]");

const toggleNavbar = function() {
    navbar.classList.toggle("active");
    overlay.classList.toggle("active");
    document.body.classList.toggle("nav-active");
}

addEventOnElements(navTogglers, "click", toggleNavbar);

/**
 * HEADER & SCROLL TOP BTN
 */

const header = document.querySelector("[data-header]");
const scrollTopBtn = document.getElementById("scroll-top");

let lastScrollPos = 0;

const hideHeader = function() {
    const isScrollBottom = lastScrollPos < window.scrollY;
    if (isScrollBottom) {
        header.classList.add("hide");
    } else {
        header.classList.remove("hide");
    }
    lastScrollPos = window.scrollY;
}

window.addEventListener("scroll", function() {
    if (window.scrollY >= 100) { // Change when to show the button
        header.classList.add("active");
        scrollTopBtn.classList.add("active"); // Make the scroll-top button visible
        hideHeader();
    } else {
        header.classList.remove("active");
        scrollTopBtn.classList.remove("active"); // Hide the scroll-top button
    }
});

// Smooth scroll to top when the button is clicked
scrollTopBtn.addEventListener("click", function(event) {
    event.preventDefault();
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
});

/**
 * HERO SLIDER
 */
const heroSlider = document.querySelector("[data-hero-slider]");
const heroSliderItems = document.querySelectorAll("[data-hero-slider-item]");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");

let currentSlidePos = 0;
let lastActiveSliderItem = heroSliderItems[0];

const updateSliderPos = function() {
    lastActiveSliderItem.classList.remove("active");
    heroSliderItems[currentSlidePos].classList.add("active");
    lastActiveSliderItem = heroSliderItems[currentSlidePos];
};

const slideNext = function() {
    if (currentSlidePos >= heroSliderItems.length - 1) {
        currentSlidePos = 0;
    } else {
        currentSlidePos++;
    }
    updateSliderPos();
};

nextBtn.addEventListener("click", slideNext);

const slidePrev = function() {
    if (currentSlidePos <= 0) {
        currentSlidePos = heroSliderItems.length - 1;
    } else {
        currentSlidePos--;
    }
    updateSliderPos();
};

prevBtn.addEventListener("click", slidePrev);

/**
 * AUTO SLIDE
 */
let autoSlideInterval;

const autoSlide = function() {
    autoSlideInterval = setInterval(function() {
        slideNext();
    }, 7000);
};

prevBtn.addEventListener("mouseover", function() {
    clearInterval(autoSlideInterval);
});
nextBtn.addEventListener("mouseover", function() {
    clearInterval(autoSlideInterval);
});

prevBtn.addEventListener("mouseout", autoSlide);
nextBtn.addEventListener("mouseout", autoSlide);

window.addEventListener("load", autoSlide);

/**
 * PARALLAX EFFECT
 */
const parallaxItems = document.querySelectorAll("[data-parallax-item]");

let x, y;

window.addEventListener("mousemove", function(event) {
    x = (event.clientX / window.innerWidth * 10) - 5;
    y = (event.clientY / window.innerHeight * 10) - 5;

    // reverse the number eg. 20 -> -20, -5 -> 5
    x = x - (x * 2);
    y = y - (y * 2);

    for (let i = 0, len = parallaxItems.length; i < len; i++) {
        x = x * Number(parallaxItems[i].dataset.parallaxSpeed);
        y = y * Number(parallaxItems[i].dataset.parallaxSpeed);
        parallaxItems[i].style.transform = `translate3d(${x}px, ${y}px, 0px)`;
    }
});



// function to show all pizzas in the menu
function showAllPizzas() {
    // Find all hidden pizza items
    const pizzaContainer = document.getElementById('pizza-container');
    const pizzaItems = pizzaContainer.querySelectorAll('.box');

    // Display all the pizza items
    pizzaItems.forEach((pizza, index) => {
        if (index >= 12) { // Assuming the first 12 are always shown
            pizza.style.display = 'block';
        }
    });

    // Hide the "Show All" button after clicking
    document.getElementById('show-all-pizza-btn').style.display = 'none';
}

// Initially show only the first 12 pizzas
window.onload = function() {
    const pizzaContainer = document.getElementById('pizza-container');
    const pizzaItems = pizzaContainer.querySelectorAll('.box');

    pizzaItems.forEach((pizza, index) => {
        if (index >= 12) {
            pizza.style.display = 'none';
        }
    });
};


/**
 * MENU SWITCHING
 */
document.querySelectorAll('.menu-btn').forEach(button => {
    button.addEventListener('click', function() {
        const menuType = this.getAttribute('data-menu');

        // Hide all menu contents
        document.querySelectorAll('.menu-content').forEach(menu => {
            menu.style.display = 'none';
        });

        // Show the selected menu
        const selectedMenu = document.getElementById(`${menuType}-menu`);
        selectedMenu.style.display = 'block';

        // Special handling for pizzor (if required, you can add more logic)
        if (menuType === 'pizza') {
            selectedMenu.classList.add('pizzor');
        } else {
            selectedMenu.classList.remove('pizzor');
        }
    });
});
 // Get the burger menu section when i click Visa Alla Menyn button on section special-dish
function showBurgerMenu() {
    // show the burger menu
    var burgerMenu = document.getElementById('burgers-menu');
    
    // Remove the 'display: none' to make it visible
    burgerMenu.style.display = 'block';
}

// Get all menu buttons
const menuButtons = document.querySelectorAll('.menu-btn');
// Function to remove the 'active' class from all buttons and add it to the clicked one
menuButtons.forEach(button => {
    button.addEventListener('click',  () => {
        // Remove 'active' class from all buttons
        menuButtons.forEach(btn => btn.classList.remove('active'));

        // Add 'active' class to the clicked button
        button.classList.add('active');
    });
});

/* HANDLE PAGE LOAD WITH URL HASH (FOR INDEX.HTML)*/
window.addEventListener('DOMContentLoaded', () => {
   if (window.location.hash) {
       const hash = window.location.hash.substring(1);
       const selectedMenu = document.getElementById(hash);

       if (selectedMenu) {
           document.querySelectorAll('.menu-content').forEach(menu => {
               menu.style.display = 'none';
           });

           selectedMenu.style.display = 'block';

           document.querySelectorAll('.menu-btn').forEach(button => {
               if (button.getAttribute('data-menu') === hash) {
                   button.classList.add('active');
               } else {
                   button.classList.remove('active');
               }
           });
       }
   }
});
