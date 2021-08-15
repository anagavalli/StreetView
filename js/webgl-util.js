function initializeWebGL(canvas) {
  // Getting WebGL context the right way
  let gl = null;
  try {
    gl = canvas.getContext("webgl2");
  } catch (error) {
    // NO-OP
  }
  if (!gl) {
    alert("Could not get WebGL2 context!");
    throw new Error("Could not get WebGL2 context!");
  }
  return gl;
}

function createShader(gl, shaderScriptId) {
  // Step 1: Get the shader source.
  const shaderScript = $("#" + shaderScriptId);
  const shaderSource = shaderScript[0].text;
  // Step 2: Confirm the type of the shader you want to create.
  let shaderType = null;
  if (shaderScript[0].type == "x-shader/x-vertex") {
    shaderType = gl.VERTEX_SHADER;
  } else if (shaderScript[0].type == "x-shader/x-fragment") {
    shaderType = gl.FRAGMENT_SHADER;
  } else {
    throw new Error("Invalid shader type: " + shaderScript[0].type)
  }
  // Step 3: Create the shader.
  var shader = gl.createShader(shaderType);
  // Step 4: Set the shader source.
  gl.shaderSource(shader, shaderSource);
  // Step 5: Compile the shader.
  gl.compileShader(shader);
  // Step 6: Check for errors.
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    var infoLog = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("An error occurred compiling the shader: " + infoLog);
  } else {
    return shader;
  }
}

function createGlslProgram(gl, vertexShaderId, fragmentShaderId) {
  // Step 1: Create a program object.
  var program = gl.createProgram();
  // Step 2: Attach the shaders.
  gl.attachShader(program, createShader(gl, vertexShaderId));
  gl.attachShader(program, createShader(gl, fragmentShaderId));
  // Step 3: Link the program.
  gl.linkProgram(program);
  // Step 4: Validate the program.
  gl.validateProgram(program);
  // Step 5: Check for errors.
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    var infoLog = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error("An error occurred linking the program: " + infoLog);
  } else {
    return program;
  }
}

function createTexture(gl, image, flip) {
  // Create the texture object.
  const texture = gl.createTexture();
  // Bind the texture object to the "target" TEXTURE_2D
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Set texture parameters
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  if (flip) {
    // Tell WebGL that pixels are flipped vertically,
    // so that we don't have to deal with flipping the y-coordinate.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  // Download the image data to the GPU.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  // Create a mipmap so that the texture can be anti-aliased.
  gl.generateMipmap(gl.TEXTURE_2D);
  // Clean up.  Tell WebGL that we are done with the target.
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

function createShape(gl, data) {
  const shape = {};
  shape.vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, shape.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.vertices), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  shape.indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  return shape;
}

function drawShape(gl, program, shape) {
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, shape.vertexBuffer);
  const vertPositionLocation = gl.getAttribLocation(program, "vert_position");
  gl.enableVertexAttribArray(vertPositionLocation);
  gl.vertexAttribPointer(vertPositionLocation, 3, gl.FLOAT, false, 4*5, 0);
  const vertTextureLocation = gl.getAttribLocation(program, "vert_texCoord");
  gl.enableVertexAttribArray(vertTextureLocation);
  gl.vertexAttribPointer(vertTextureLocation, 2, gl.FLOAT, false, 4*5, 4*3);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape.indexBuffer);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  gl.useProgram(null);
}

// This function takes as arguments a PreloadJS LoadQueue object (in which all images
// have previously been loaded), and a callback function. This function returns immediately,
// but the images will be processed asynchronously. When the metadata is ready, the input
// callback function will be called with a single argument, which is an array of objects
// that is the same length as the input queue. Each object in this array contains four fields:
// - id: A string which is the id associated with the image in the PreloadJS LoadQueue.
// - latitude: An array (length 3) of numbers, containing the degrees, minutes, and seconds of latitude north.
// - longitude: An array (length 3) of numbers, containing the degrees, minutes, and seconds of longitude west.
// - heading: An integer in the range [0, 359], representing the direction in the center of the panorama.
//   This is specified as a compass heading; that is, 0 degrees is north, and degrees increase as you turn clockwise.
// If an image does not contain the above tags, then the fields of its corresponding object may be left undefined.
function getImageMetadata(queue, callback) {
  let deepFind = function(obj, path) {
    let pathsplit = path.split('.');
    let current = obj;

    for (let i=0; i < pathsplit.length; i++) {
      if (current[pathsplit[i]] == undefined) {
        return undefined;
      } else {
        current = current[pathsplit[i]];
      }
    }
    return current;
  }

  let getGPS = function(image, imageID) {
    return new Promise((resolve, reject) => {
      EXIF.enableXmp();
      EXIF.getData(image, () => {
        resolve({
          id: imageID,
          latitude: EXIF.getTag(image, "GPSLatitude"),
          longitude: EXIF.getTag(image, "GPSLongitude"),
          poseHeadingDegrees: deepFind(image, "xmpdata.x:xmpmeta.rdf:RDF.rdf:Description.@attributes.GPano:PoseHeadingDegrees"),
        });
      });
    });
  }

  let promises = [];
  for (let queueItem of queue.getItems(true)) {
    promises.push(getGPS(queueItem.rawResult, queueItem.item.id));
  }
  Promise.all(promises).then(callback);
}