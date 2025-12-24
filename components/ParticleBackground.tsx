
import React, { useEffect, useRef } from 'react';

const ParticleBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let particles: {
            x: number;
            y: number;
            radius: number;
            dx: number;
            dy: number;
            color: string;
            alpha: number;
        }[] = [];

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initParticles();
        };

        const initParticles = () => {
            particles = [];
            const particleCount = Math.floor((canvas.width * canvas.height) / 10000); // Responsive count

            for (let i = 0; i < particleCount; i++) {
                const color = Math.random() > 0.5 ? 'rgba(59, 130, 246, ' : 'rgba(147, 51, 234, '; // Blue or Purple
                particles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    radius: Math.random() * 2 + 1,
                    dx: (Math.random() - 0.5) * 0.5,
                    dy: (Math.random() - 0.5) * 0.5,
                    color: color,
                    alpha: Math.random() * 0.5 + 0.1
                });
            }
        };

        const animate = () => {
            requestAnimationFrame(animate);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            particles.forEach(p => {
                p.x += p.dx;
                p.y += p.dy;

                // Bounce off walls
                if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
                if (p.y < 0 || p.y > canvas.height) p.dy *= -1;

                // Draw
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color + p.alpha + ')';
                ctx.fill();

                // Glow effect
                ctx.shadowBlur = 15;
                ctx.shadowColor = p.color + '1)';
            });
        };

        window.addEventListener('resize', resize);
        resize();
        animate();

        return () => window.removeEventListener('resize', resize);
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
        />
    );
};

export default ParticleBackground;
