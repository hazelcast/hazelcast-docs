;(function() {
    console.log('heelo')
    var images = document.getElementsByClassName('image');
    if (images.length > 0) {
        for (var i = 0; i < images.length; i++) {
            let img = images[i].children[0];
            let parent = images[i].parentNode.parentElement;
            let modal = document.createElement('div');
            modal.className = 'modal';
            let modalClose = document.createElement('span');
            modalClose.className = 'close';
            modalClose.innerHTML = '&times;';
            let modalImage = document.createElement('img');
            modalImage.src = img.getAttribute('src');
            modalImage.className = 'modal-image';
            modal.appendChild(modalClose);
            modal.appendChild(modalImage);
            parent.appendChild(modal);
            console.log(modal)
            img.addEventListener('click', function(e) {
                e.preventDefault();
                console.log(this)
                modal.style.display = 'block';
            })
            modalClose.onclick = function() {
                modal.style.display = "none";
              }
            }
        }
})();

/*
https://www.w3schools.com/howto/howto_css_modal_images.asp
<!-- The Modal -->
<div id="myModal" class="modal">

  <!-- The Close Button -->
  <span class="close">&times;</span>

  <!-- Modal Content (The Image) -->
  <img class="modal-content" id="img01">

  <!-- Modal Caption (Image Text) -->
  <div id="caption"></div>
</div>
*/
