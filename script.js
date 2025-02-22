const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

if (!gl) {
    alert("WebGL não suportado");
}

const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    uniform vec2 u_translation;
    varying vec2 v_texCoord;
    
    void main() {
        gl_Position = vec4(a_position + u_translation, 0, 1);
        v_texCoord = a_texCoord;
    }
`;

const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform vec4 u_color;
    uniform bool u_useTexture;
    varying vec2 v_texCoord;
    
    void main() {
        if (u_useTexture) {
            gl_FragColor = texture2D(u_texture, v_texCoord) * u_color;
        } else {
            gl_FragColor = u_color;
        }
    }
`;

let player1Health = 100;
let player2Health = 100;
const ATTACK_DISTANCE = 0.2; // Distância dos braços
const DAMAGE_DISTANCE = 0.1; // Distância para começar o dano
const PUSH_DISTANCE = 0.08; // Distância para empurrar
const PUSH_FORCE = 0.015; // Força do empurrão
const RING_LIMIT = 0.75;
let gameActive = true; // Variável para controlar o estado do jogo

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Erro no shader:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Erro ao linkar programa:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
}

const positionLocation = gl.getAttribLocation(program, "a_position");
const translationLocation = gl.getUniformLocation(program, "u_translation");
const colorLocation = gl.getUniformLocation(program, "u_color");

// Textura dos robôs
const robot1Texture = createRobotTexture(gl, '#ff0000', '#aa0000');
const robot2Texture = createRobotTexture(gl, '#0000ff', '#0000aa');

// Adicionar atributo de coordenadas de textura
const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
const texCoordBuffer = gl.createBuffer();
const useTextureLocation = gl.getUniformLocation(program, "u_useTexture");
const textureLocation = gl.getUniformLocation(program, "u_texture");

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

const messageElement = document.createElement("div");
messageElement.className = "game-message";
messageElement.style.position = "absolute";
messageElement.style.top = "10px";
messageElement.style.left = "50%";
messageElement.style.transform = "translateX(-50%)";
messageElement.style.color = "white";
messageElement.style.fontSize = "24px";
messageElement.style.display = "none";
document.body.appendChild(messageElement);

function drawRobotWithWeapons(x, y, isPlayer1) {
    // Desenha o robô base primeiro
    if (isPlayer1) {
        drawRobot1(x, y);
    } else {
        drawRobot2(x, y);
    }
    
    // Desenha escudo se estiver defendendo
    if ((isPlayer1 && player1Defending) || (!isPlayer1 && player2Defending)) {
        drawShield(x, y, isPlayer1 ? [1, 1, 0, 1] : [0, 1, 1, 1]);
    }
}

function drawWheel(x, y, color) {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(colorLocation, color);

    const wheel = [
        -0.02, -0.02,
         0.02, -0.02,
        -0.02,  0.02,
         0.02,  0.02,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wheel), gl.STATIC_DRAW);
    gl.uniform2f(translationLocation, x, y);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawCylinder(x, y, radius, height, color) {
    const numSegments = 30;
    const angleStep = 2 * Math.PI / numSegments;
    let vertices = [];
    
    for (let i = 0; i < numSegments; i++) {
        const angle = i * angleStep;
        const nextAngle = (i + 1) * angleStep;
        
        vertices.push(radius * Math.cos(angle), radius * Math.sin(angle));
        vertices.push(radius * Math.cos(nextAngle), radius * Math.sin(nextAngle));
        vertices.push(0, 0);
        
        vertices.push(radius * Math.cos(angle), radius * Math.sin(angle) - height);
        vertices.push(radius * Math.cos(nextAngle), radius * Math.sin(nextAngle) - height);
        vertices.push(0, 0);
    }

    gl.uniform1i(useTextureLocation, 0); // Textura desativada
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(colorLocation, color);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.uniform2f(translationLocation, x, y);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertices.length / 2);
}

function drawArena() {
    // Desenha o cilindro principal da arena
    drawCylinder(0, -0.2, 0.8, 0.15, [0.4, 0.4, 0.4, 1]); 
    
    // Trilho central
    drawRectangle(0, -0.15, 1.6, 0.02, [0.6, 0.6, 0.6, 1]);
    
    // Detalhes do trilho
    for (let i = -0.7; i <= 0.7; i += 0.2) {
        drawRectangle(i, -0.15, 0.02, 0.04, [0.3, 0.3, 0.3, 1]);
    }
}

function createRobotTexture(gl, primaryColor, secondaryColor) {
    // Criar um canvas temporário para gerar a textura
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Criar um padrão de grade ou hexagonal
    ctx.fillStyle = primaryColor;
    ctx.fillRect(0, 0, 128, 128);

    // Adicionar detalhes/padrões
    ctx.fillStyle = secondaryColor;
    for (let i = 0; i < 128; i += 16) {
        for (let j = 0; j < 128; j += 16) {
            ctx.fillRect(i, j, 8, 8);
        }
    }

    // Criar a textura WebGL
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);

    return texture;
}

function createHexagonTexCoords() {
    const texCoords = [];
    for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        texCoords.push(
            0.5 + 0.5 * Math.cos(angle),
            0.5 + 0.5 * Math.sin(angle)
        );
    }
    return texCoords;
}

function createHexagonVertices(x, y, size) {
    const vertices = [];
    for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        vertices.push(
            x + size * Math.cos(angle),
            y + size * Math.sin(angle)
        );
    }
    return vertices;
}

function drawHexagon(x, y, size, color) {
    const vertices = [];
    for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        vertices.push(
            x + size * Math.cos(angle),
            y + size * Math.sin(angle)
        );
    }
    
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(colorLocation, color);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.uniform2f(translationLocation, 0, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 6);
}

function drawOctagon(x, y, size, color) {
    const vertices = [];
    for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        vertices.push(
            x + size * Math.cos(angle),
            y + size * Math.sin(angle)
        );
    }
    
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(colorLocation, color);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.uniform2f(translationLocation, 0, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 8);
}

function drawTriangle(x, y, size, color) {
    const vertices = [
        x, y + size,
        x - size, y - size,
        x + size, y - size
    ];
    
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(colorLocation, color);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.uniform2f(translationLocation, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function drawDiamond(x, y, size, color) {
    const vertices = [
        x, y + size,
        x - size, y,
        x, y - size,
        x + size, y
    ];
    
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(colorLocation, color);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.uniform2f(translationLocation, 0, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

function drawTexturedShape(vertices, texCoords, texture, color) {
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(texCoordLocation);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(textureLocation, 0);
    gl.uniform1i(useTextureLocation, 1);
    gl.uniform4fv(colorLocation, color);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, vertices.length / 2);
}

function drawRobot1(x, y) {
    // Corpo principal - Formato hexagonal
    const bodyColor = player1Defending ? [1, 1, 0, 1] : [1, 0, 0, 1];
    drawHexagon(x, y, 0.08, bodyColor);

    const bodyVertices = createHexagonVertices(x, y, 0.08);
    const texCoords = createHexagonTexCoords();
    drawTexturedShape(bodyVertices, texCoords, robot1Texture, [1, 1, 1, 1]);
    
    // Cabeça - Triângulo
    drawTriangle(x, y + 0.1, 0.05, [0.8, 0, 0, 1]);
    
    // Braços
    drawRectangle(x - 0.1, y, 0.04, 0.08, [0.7, 0, 0, 1]);
    drawRectangle(x + 0.1, y, 0.04, 0.08, [0.7, 0, 0, 1]);
    
    // Rodas
    drawWheel(x - 0.06, y - 0.12, [0.2, 0.2, 0.2, 1]);
    drawWheel(x + 0.06, y - 0.12, [0.2, 0.2, 0.2, 1]);
}

function drawRobot2(x, y) {
    // Corpo principal - Formato octagonal
    const bodyColor = player2Defending ? [0, 1, 1, 1] : [0, 0, 1, 1];
    drawOctagon(x, y, 0.08, bodyColor);

    const bodyVertices = createHexagonVertices(x, y, 0.08);
    const texCoords = createHexagonTexCoords();
    drawTexturedShape(bodyVertices, texCoords, robot2Texture, [1, 1, 1, 1]);
    
    // Cabeça - Diamante
    drawDiamond(x, y + 0.1, 0.05, [0, 0, 0.8, 1]);
    
    // Braços
    drawRectangle(x - 0.1, y, 0.04, 0.08, [0, 0, 0.7, 1]);
    drawRectangle(x + 0.1, y, 0.04, 0.08, [0, 0, 0.7, 1]);
    
    // Rodas
    drawWheel(x - 0.06, y - 0.12, [0.2, 0.2, 0.2, 1]);
    drawWheel(x + 0.06, y - 0.12, [0.2, 0.2, 0.2, 1]);
}

function drawHolofote(x, y, isLeft, isBackground = false) {
    // Ajusta escala e posição se for o holofote do fundo
    let scale = isBackground ? 0.7 : 1;
    let yOffset = isBackground ? -0.2 : 0;
    
    // Base principal
    drawCylinder(x * scale, (y + yOffset) * scale, 0.05 * scale, 0.35 * scale, [0.5, 0.5, 0.5, 1]);
    
    // Suporte central
    drawRectangle(x * scale, (y + yOffset - 0.23) * scale, 0.065 * scale, 0.5 * scale, [0.4, 0.4, 0.4, 1]);
    
    // Braço articulado
    const angle = isLeft ? Math.PI / 36 : -Math.PI / 36;
    const armX = isLeft ? x * scale + Math.cos(angle) * 0.1 * scale: x * scale + Math.cos(angle) * -0.1 * scale;
    const armY = isLeft ? (y + yOffset) * scale + Math.sin(angle) * 0.12 * scale: (y + yOffset) * scale + Math.sin(angle) * 0 * scale;
    
    // Desenha o braço articulado
    drawRectangle(armX, armY, 0.12 * scale, 0.03 * scale, [0.5, 0.5, 0.5, 1]);
    
    // Caixa de luz na ponta
    drawRectangle(armX + (isLeft ? 0.1 : -0.1) * scale, armY, 0.1 * scale, 0.1 * scale, [0.5, 0.5, 0.5, 1]);
}

function drawHolofoteLightAndShadow(x, y, isLeft, isBackground = false) {
    let scale = isBackground ? 0.7 : 1;
    let yOffset = isBackground ? -0.2 : 0;
    
    // Desenha a sombra primeiro
    const shadowVertices = [];
    const shadowX = x * scale + (isLeft ? 0.13 : -0.15) * scale;
    const shadowWidth = -0.03 * scale;
    const shadowHeight = 0.3 * scale;
    
    shadowVertices.push(
        shadowX, (y + yOffset) * scale,
        shadowX + (isLeft ? shadowWidth : +shadowWidth), (y + yOffset - shadowHeight) * scale,
        shadowX - (isLeft ? 0.03 : -0.03) * scale, (y + yOffset) * scale,
        shadowX + (isLeft ? shadowWidth + 0.3 : -shadowWidth - 0.35) * scale, (y + yOffset - shadowHeight) * scale
    );
    
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(colorLocation, [0, 0, 0, 0.3]);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shadowVertices), gl.STATIC_DRAW);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, shadowVertices.length / 2);
    gl.disable(gl.BLEND);
}

function drawScene() {
    gl.clearColor(0.1, 0.1, 0.1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Desenha arena
    drawArena();
    
    // Desenha efeitos de luz e sombra dos holofotes
    drawHolofoteLightAndShadow(-0.62, 0.5, true);
    drawHolofoteLightAndShadow(0.635, 0.5, false); 
    drawHolofoteLightAndShadow(0.07, 1.17, true, true);
    
    // Desenha holofotes
    drawHolofote(-0.7, 0.5, true);
    drawHolofote(0.7, 0.5, false);
    drawHolofote(0, 1.2, true, true);
    
    // Desenha barras de vida
    drawHealthBar(-0.5, 0.8, player1Health, [1, 0, 0, 1]);
    drawHealthBar(0.5, 0.8, player2Health, [0, 0, 1, 1]);
    
    // Desenha robôs e escudos
    drawRobotWithWeapons(player1X, 0, true);
    drawRobotWithWeapons(player2X, 0, false);
    
    // Desenha as espadas por último para garantir que, com um ataque, elas fiquem na frente
    if (player1Attacking) {
        drawSword(player1X + 0.1, 0, true, [1, 0, 0, 1]);
    }
    if (player2Attacking) {
        drawSword(player2X - 0.1, 0, false, [0, 0, 1, 1]);
    }
    
    if (gameActive) {
        checkCollisionAndDamage();
        
        if (player1Health <= 0) {
            showMessage("Jogador 2 venceu!");
        } else if (player2Health <= 0) {
            showMessage("Jogador 1 venceu!");
        }
    }

    requestAnimationFrame(drawScene);
}

function drawRectangle(x, y, width, height, color) {
    gl.uniform1i(useTextureLocation, 0); // Textura desativada
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(colorLocation, color);

    const rect = [
        x - width / 2, y - height / 2,
        x + width / 2, y - height / 2,
        x - width / 2, y + height / 2,
        x + width / 2, y + height / 2,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rect), gl.STATIC_DRAW);
    gl.uniform2f(translationLocation, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawSword(x, y, isLeft, color) {
    const angle = isLeft ? 0 : Math.PI;
    const vertices = [
        x, y,  // Base da espada
        x + Math.cos(angle) * 0.15, y + Math.sin(angle) * 0.15,  // Ponta
        x + Math.cos(angle + Math.PI/6) * 0.03, y + Math.sin(angle + Math.PI/6) * 0.03,  // Guarda superior
        x + Math.cos(angle - Math.PI/6) * 0.03, y + Math.sin(angle - Math.PI/6) * 0.03   // Guarda inferior
    ];
    
    gl.uniform1i(useTextureLocation, 0); // Textura desativada
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(colorLocation, color);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.uniform2f(translationLocation, 0, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

function drawShield(x, y, color) {
    const shield = [
        x - 0.06, y + 0.06,
        x + 0.06, y + 0.06,
        x - 0.06, y - 0.06,
        x + 0.06, y - 0.06
    ];
    
    gl.uniform1i(useTextureLocation, 0); // Textura desativada
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(colorLocation, color);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shield), gl.STATIC_DRAW);
    gl.uniform2f(translationLocation, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawHealthBar(x, y, health, color) {
    // Borda da barra
    drawRectangle(x, y, 0.2, 0.03, [0.3, 0.3, 0.3, 1]);
    // Vida atual
    drawRectangle(x - (0.2 - health * 0.002) / 2, y, health * 0.002, 0.02, color);
}

// Tratamento da vida de cada robô
function checkCollisionAndDamage() {
    if (!gameActive) return;
    
    const distance = Math.abs(player1X - player2X);
    
    // Verifica ataques quando os braços se tocam
    if (distance < ATTACK_DISTANCE) {
        if (player1Attacking && !player2Defending && player1X < player2X) {
            const damage = Math.floor((ATTACK_DISTANCE - distance) * 100);
            player2Health = Math.max(0, player2Health - damage);
        }
        
        if (player2Attacking && !player1Defending && player2X > player1X) {
            const damage = Math.floor((ATTACK_DISTANCE - distance) * 100);
            player1Health = Math.max(0, player1Health - damage);
        }
    }
    
    // Sistema de empurrão atualizado
    if (distance < PUSH_DISTANCE) {
        if (player1X < player2X) {
            if (player2X < RING_LIMIT) {
                player2X = Math.min(RING_LIMIT, player2X + PUSH_FORCE);
            }
        } else {
            if (player2X > -RING_LIMIT) {
                player2X = Math.max(-RING_LIMIT, player2X - PUSH_FORCE);
            }
        }
    }
}

// Tratativa dos comandos e jogabilidade
function isMovingRight(playerX) {
    return (playerX >= RING_LIMIT);
}

function isMovingLeft(playerX) {
    return (playerX <= -RING_LIMIT);
}

requestAnimationFrame(drawScene);

// Posicionamento
let player1X = -0.5;
let player2X = 0.5;

// Ação
let player1Attacking = false;
let player2Attacking = false;
let player1Defending = false;
let player2Defending = false;

function showMessage(message) {
    messageElement.innerText = message;
    messageElement.style.display = "block";
    gameActive = false;
    
    setTimeout(() => {
        messageElement.style.display = "none";
        resetGame();
    }, 2000);
}

function resetGame() {
    player1X = -0.5;
    player2X = 0.5;
    player1Health = 100;
    player2Health = 100;
    player1Attacking = false;
    player2Attacking = false;
    player1Defending = false;
    player2Defending = false;
    gameActive = true; // Reativa o jogo
}

document.addEventListener("keydown", (event) => {
    if (!gameActive) return;
    
    const oldPlayer1X = player1X;
    const oldPlayer2X = player2X;
    
    // Controles do Jogador 1 (agora usando A e D)
    if (event.key === "a") {
        player1X = Math.max(-RING_LIMIT, player1X - 0.05);
        if (player1X > player2X) player1X = oldPlayer1X;
    }
    if (event.key === "d") {
        player1X = Math.min(RING_LIMIT, player1X + 0.05);
        if (player1X > player2X) player1X = oldPlayer1X;
    }

    // Controles do Jogador 2 (agora usando as setas)
    if (event.key === "ArrowLeft") {
        player2X = Math.max(-RING_LIMIT, player2X - 0.05);
        if (player2X < player1X) player2X = oldPlayer2X;
    }
    if (event.key === "ArrowRight") {
        player2X = Math.min(RING_LIMIT, player2X + 0.05);
        if (player2X < player1X) player2X = oldPlayer2X;
    }
    
    // Ataque e defesa do Jogador 1 (W e S)
    if (event.key === "w") player1Attacking = true;
    if (event.key === "s") player1Defending = true;

    // Ataque e defesa do Jogador 2 (setas cima e baixo)
    if (event.key === "ArrowUp") player2Attacking = true;
    if (event.key === "ArrowDown") player2Defending = true;
});

document.addEventListener("keyup", (event) => {
    // Ataque e defesa do Jogador 1 (W e S)
    if (event.key === "w") player1Attacking = false;
    if (event.key === "s") player1Defending = false;

    // Ataque e defesa do Jogador 2 (setas cima e baixo)
    if (event.key === "ArrowUp") player2Attacking = false;
    if (event.key === "ArrowDown") player2Defending = false;
});